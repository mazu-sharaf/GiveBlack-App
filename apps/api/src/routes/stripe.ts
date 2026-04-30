import type { FastifyPluginAsync } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { db } from "../lib/db.js";
import { env } from "../config/env.js";
import { getStripe, verifyStripeWebhook } from "../services/stripe.js";
import { broadcastChannel } from "../realtime/hub.js";
import { computeReinvestAllocation } from "../lib/education-reinvest.js";
import {
  incrementOrgTotalsFromDonation,
  markDonationSucceededWithPayout,
  repairSucceededDonationsLegacyHold,
  syncOrganizationRaisedFromSucceededDonations,
} from "../lib/org-payout-hold.js";
import { stripeId } from "../lib/stripe-ids.js";
import { TIER_LIMITS } from "../lib/tier-limits.js";
import { maybeNotifyOrgSubscriptionPlanUpgrade } from "../services/user-push.js";

export { TIER_LIMITS };

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

const emailRateLimitMap = new Map<string, RateLimitBucket>();
const ipRateLimitMap = new Map<string, RateLimitBucket>();

function pruneRateLimitMap(map: Map<string, RateLimitBucket>, now: number): void {
  for (const [key, bucket] of map.entries()) {
    if (now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
      map.delete(key);
    }
  }
}

function checkRateLimit(
  map: Map<string, RateLimitBucket>,
  key: string,
  limit: number,
  now: number
): boolean {
  const bucket = map.get(key);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    map.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= limit) {
    return false;
  }
  bucket.count += 1;
  return true;
}

function applyGuestRateLimit(
  email: string,
  ip: string,
): { allowed: boolean; reason?: string } {
  const now = Date.now();
  pruneRateLimitMap(emailRateLimitMap, now);
  pruneRateLimitMap(ipRateLimitMap, now);

  if (!checkRateLimit(ipRateLimitMap, ip, IP_LIMIT, now)) {
    return { allowed: false, reason: "Too many requests from this IP address. Please try again later." };
  }
  if (!checkRateLimit(emailRateLimitMap, email, EMAIL_LIMIT, now)) {
    return { allowed: false, reason: "Too many requests for this email address. Please try again later." };
  }
  return { allowed: true };
}

function tierFromProductId(productId: string | null | undefined): string {
  if (!productId) return "free";
  if (productId === env.STRIPE_PRODUCT_GROWTH) return "growth";
  if (productId === env.STRIPE_PRODUCT_INSTITUTIONAL) return "institutional";
  return "free";
}

/** Resolve tier from Stripe Price ids (robust when test/live products differ from STRIPE_PRODUCT_* env). */
function tierFromPriceId(priceId: string | null | undefined): string {
  if (!priceId) return "free";
  if (priceId === env.STRIPE_PRICE_GROWTH) return "growth";
  if (priceId === env.STRIPE_PRICE_INSTITUTIONAL) return "institutional";
  return "free";
}

function productIdFromSubscriptionItems(items: { data?: Array<{ price?: unknown }> } | undefined): string | undefined {
  const raw = items?.data?.[0]?.price;
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as { product?: unknown };
  const prod = p.product;
  if (typeof prod === "string") return prod;
  if (prod && typeof prod === "object" && "id" in prod) return String((prod as { id: string }).id);
  return undefined;
}

function priceIdFromSubscriptionItems(items: { data?: Array<{ price?: unknown }> } | undefined): string | undefined {
  const raw = items?.data?.[0]?.price;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "id" in raw) return String((raw as { id: string }).id);
  return undefined;
}

function priceIdForTier(tier: string): string {
  if (tier === "growth") return env.STRIPE_PRICE_GROWTH;
  if (tier === "institutional") return env.STRIPE_PRICE_INSTITUTIONAL;
  throw new Error(`No price for tier: ${tier}`);
}

function normalizeEmail(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function normalizeKey(value: string | null | undefined): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function resolveEducationPartnerId(code: string | undefined | null): Promise<string | null> {
  const key = normalizeKey(code ?? "");
  if (!key) return null;
  const res = await db.query(
    `select id::text from education_partners where lower(code) = $1 and active = true`,
    [key]
  );
  return (res.rows[0] as { id: string } | undefined)?.id ?? null;
}

function tierForSubscriptionStatus(status: string, paidTier: string): string {
  // Only grant paid features once Stripe confirms the subscription is active/trialing.
  // For lifecycle states like "incomplete" (payment method not confirmed yet), keep the tier as free.
  if (status === "active" || status === "trialing") return paidTier;
  return "free";
}

/**
 * If Stripe still reports incomplete but the invoice is paid or the payment_intent succeeded,
 * treat as active for tier resolution (matches native sync-native behavior).
 */
function applySubscriptionPaidHeuristic(subAsRecord: Record<string, unknown>): void {
  const st = String(subAsRecord.status || "");
  if (st !== "incomplete") return;

  const latestInvoice = subAsRecord.latest_invoice as Record<string, unknown> | string | undefined;
  const inv =
    latestInvoice && typeof latestInvoice === "object" ? (latestInvoice as Record<string, unknown>) : undefined;
  const paymentIntentRaw = inv?.payment_intent;
  const paymentIntent =
    paymentIntentRaw && typeof paymentIntentRaw === "object"
      ? (paymentIntentRaw as Record<string, unknown>)
      : undefined;
  const paymentIntentStatus = paymentIntent?.status as string | undefined;
  const isPaymentConfirmed = paymentIntentStatus === "succeeded" || paymentIntentStatus === "processing";
  const invoiceStatus = inv?.status as string | undefined;
  const invoicePaid = invoiceStatus === "paid";
  // Paid invoice but PI not expanded in payload (webhook): still counts as activated for our tier logic.
  if (isPaymentConfirmed || invoicePaid) {
    subAsRecord.status = "active";
  }
}

async function upsertOrgSubscriptionFromStripe(
  subscription: Record<string, unknown>,
  fallbackOrgId?: string
): Promise<{
  orgId: string;
  tier: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  subscriptionId: string;
}> {
  applySubscriptionPaidHeuristic(subscription);

  const metadata = (subscription.metadata || {}) as Record<string, string>;
  const orgId = metadata.org_id || fallbackOrgId;
  if (!orgId) throw new Error("Missing organization id for subscription");

  const items = subscription.items as { data?: Array<{ price?: { product?: string } }> } | undefined;
  const productId = productIdFromSubscriptionItems(items);
  const priceId = priceIdFromSubscriptionItems(items);
  const resolvedTier =
    (metadata.tier ? String(metadata.tier) : "") || tierFromProductId(productId) || tierFromPriceId(priceId);
  const status = String(subscription.status || "incomplete");
  if ((status === "active" || status === "trialing") && resolvedTier === "free" && !metadata.tier) {
    console.warn("[stripe] Subscription active/trialing but tier resolved to free (check STRIPE_PRODUCT_*, STRIPE_PRICE_* env vs Stripe)", {
      orgId,
      productId,
      priceId,
    });
  }
  const effectiveTier = tierForSubscriptionStatus(status, resolvedTier);
  const customerId = String(subscription.customer || "");
  const subscriptionId = String(subscription.id || "");
  const periodStart = subscription.current_period_start
    ? new Date(Number(subscription.current_period_start) * 1000).toISOString()
    : null;
  const periodEnd = subscription.current_period_end
    ? new Date(Number(subscription.current_period_end) * 1000).toISOString()
    : null;
  const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
  const canceledAt = subscription.canceled_at
    ? new Date(Number(subscription.canceled_at) * 1000).toISOString()
    : null;

  let previousTier: string | null | undefined;
  let previousStatus: string | null | undefined;
  if (subscriptionId) {
    const prevRes = await db.query(
      `select tier, status from org_subscriptions where stripe_subscription_id = $1 limit 1`,
      [subscriptionId]
    );
    const prow = prevRes.rows[0] as { tier?: string; status?: string } | undefined;
    previousTier = prow?.tier;
    previousStatus = prow?.status;
  }

  await db.query(
    `insert into org_subscriptions (org_id, tier, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end, canceled_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (stripe_subscription_id) do update set
        -- Manual admin removal sets canceled_at. If the row is manually canceled,
        -- do not let Stripe "active" updates re-enable the entitlement.
        tier = case
          when excluded.status in ('active', 'trialing') and org_subscriptions.canceled_at is null then excluded.tier
          else org_subscriptions.tier
        end,
        -- Always reflect Stripe status so charity + admin UIs stay in sync.
        -- Entitlement gating (if any) should be handled at the feature-check layer.
        status = excluded.status,
        stripe_customer_id = excluded.stripe_customer_id,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        canceled_at = excluded.canceled_at,
        updated_at = now()`,
    [orgId, effectiveTier, status, customerId || null, subscriptionId, periodStart, periodEnd, cancelAtPeriodEnd, canceledAt]
  );

  if (subscriptionId) {
    const afterRes = await db.query(
      `select tier, status, current_period_end from org_subscriptions where stripe_subscription_id = $1 limit 1`,
      [subscriptionId]
    );
    const after = afterRes.rows[0] as { tier?: string; status?: string; current_period_end?: string | null } | undefined;
    const periodEndIso = after?.current_period_end != null ? String(after.current_period_end) : null;
    void maybeNotifyOrgSubscriptionPlanUpgrade({
      orgId,
      stripeSubscriptionId: subscriptionId,
      previousTier,
      newTier: after?.tier ?? effectiveTier,
      previousStatus,
      newStatus: after?.status ?? status,
      currentPeriodEndIso: periodEndIso,
    }).catch((err) => {
      console.warn("[stripe] subscription upgrade notify failed", err);
    });
  }

  return {
    orgId,
    tier: effectiveTier,
    status,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd,
    subscriptionId,
  };
}

const createIntentSchema = z.object({
  orgId: z.string().min(1),
  campaignId: z.string().optional(),
  // Coerce from string to number so mobile/web JSON bodies are forgiving
  amount: z.coerce.number().positive(),
  currency: z.string().default("usd"),
  educationPartnerCode: z.string().optional(),
  reinvestOptIn: z.boolean().optional().default(false),
  reinvestPct: z.coerce.number().min(0).max(100).optional().default(5),
});

const donationCheckoutSchema = z.object({
  orgId: z.string().min(1),
  campaignId: z.string().optional(),
  amount: z.coerce.number().positive(),
  currency: z.string().default("usd"),
  // Optional return URL for mobile deep link back into the app after web checkout
  returnUrl: z.string().min(1).optional(),
  educationPartnerCode: z.string().optional(),
  reinvestOptIn: z.boolean().optional().default(false),
  reinvestPct: z.coerce.number().min(0).max(100).optional().default(5),
});

const topupIntentSchema = z.object({
  amount: z.coerce.number().positive(),
  currency: z.string().default("usd"),
});

const checkoutSchema = z.object({
  org_id: z.string().min(1),
  tier: z.enum(["growth", "institutional"]),
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
});

const mobileSubscriptionSchema = z.object({
  org_id: z.string().min(1),
  tier: z.enum(["growth", "institutional"]),
});

const syncSubscriptionSchema = z.object({
  org_id: z.string().min(1),
  subscription_id: z.string().min(1).optional(),
});

const syncNativeDonationSchema = z.object({
  paymentIntentId: z.string().min(1),
});

const guestCreateIntentSchema = z.object({
  orgId: z.string().min(1),
  campaignId: z.string().optional(),
  amount: z.coerce.number().positive(),
  currency: z.string().default("usd"),
  email: z.string().email(),
  name: z.string().optional(),
  educationPartnerCode: z.string().optional(),
  reinvestOptIn: z.boolean().optional().default(false),
  reinvestPct: z.coerce.number().min(0).max(100).optional().default(5),
});

const guestSyncDonationSchema = z.object({
  paymentIntentId: z.string().min(1),
  email: z.string().email(),
});

const guestDonateCheckoutSchema = z.object({
  orgId: z.string().min(1),
  campaignId: z.string().optional(),
  amount: z.coerce.number().positive(),
  currency: z.string().default("usd"),
  email: z.string().email(),
  name: z.string().optional(),
  educationPartnerCode: z.string().optional(),
  reinvestOptIn: z.boolean().optional().default(false),
  reinvestPct: z.coerce.number().min(0).max(100).optional().default(5),
  returnUrl: z.string().optional(),
});

const portalSchema = z.object({
  org_id: z.string().min(1),
  return_url: z.string().url().optional(),
});

function requireStripe(reply: any): ReturnType<typeof getStripe> | null {
  if (!env.STRIPE_SECRET_KEY) {
    reply.code(503).send({ error: "Payment service is not configured. Please contact support." });
    return null;
  }
  return getStripe();
}

export const stripeRoutes: FastifyPluginAsync = async (app) => {
  async function userOwnsOrganization(userId: string, userEmail: string, org: Record<string, unknown>): Promise<boolean> {
    const orgContact = normalizeEmail(org.contact_email as string | null | undefined);
    if (orgContact && orgContact === normalizeEmail(userEmail)) return true;

    // Backward-compatible fallback for organizations created without contact_email:
    // tie ownership through approved charity request(s) for the current user.
    const orgNameKey = normalizeKey(String(org.name || ""));
    const normalizedUserEmail = normalizeEmail(userEmail);
    const fallbackRes = await db.query(
      `select 1
       from charity_requests cr
       where cr.status = 'approved'
         and (
           cr.user_id = $1
           or lower(coalesce(cr.contact_email, '')) = $4
         )
         and (
           regexp_replace(lower(coalesce(cr.charity_name, '')), '[^a-z0-9]', '', 'g') = $2
           or lower(coalesce(cr.contact_email, '')) = $3
         )
       limit 1`,
      [userId, orgNameKey, orgContact, normalizedUserEmail]
    );
    return Boolean(fallbackRes.rowCount && fallbackRes.rowCount > 0);
  }

  async function getOrCreateStripeCustomer(stripe: ReturnType<typeof getStripe>, userId: string): Promise<string> {
    const userRes = await db.query("select email, full_name from users where id = $1", [userId]);
    const u = userRes.rows[0] as { email: string; full_name: string } | undefined;

    const existingRes = await db.query(
      "select stripe_customer_id from user_stripe_customers where user_id = $1",
      [userId]
    );
    const existing = (existingRes.rows[0] as { stripe_customer_id: string } | undefined)?.stripe_customer_id;
    if (existing) {
      try {
        const existingCustomer = await stripe.customers.retrieve(existing);
        if (!("deleted" in existingCustomer) || !existingCustomer.deleted) {
          return existing;
        }
      } catch {
        // Customer can belong to a different Stripe mode/account (test vs live).
        // Fall through and recreate a valid customer for the active key.
      }
    }

    const customer = await stripe.customers.create({
      email: u?.email,
      name: u?.full_name,
      metadata: { userId },
    });

    await db.query(
      `insert into user_stripe_customers (user_id, stripe_customer_id) values ($1, $2)
       on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id`,
      [userId, customer.id]
    );

    return customer.id;
  }

  async function getOrCreateOrgStripeCustomer(
    stripe: ReturnType<typeof getStripe>,
    orgId: string,
    orgName: string,
    orgEmail?: string | null
  ): Promise<string> {
    const subRes = await db.query(
      "select stripe_customer_id from org_subscriptions where org_id = $1 and stripe_customer_id is not null order by created_at desc limit 1",
      [orgId]
    );
    const existing = (subRes.rows[0] as Record<string, unknown> | undefined)?.stripe_customer_id as string | null;
    if (existing) {
      try {
        const existingCustomer = await stripe.customers.retrieve(existing);
        if (!("deleted" in existingCustomer) || !existingCustomer.deleted) {
          return existing;
        }
      } catch {
        // Stored customer can belong to a different Stripe account/mode.
        // Recreate under the active API key.
      }
    }

    const customer = await stripe.customers.create({
      name: orgName,
      email: orgEmail || undefined,
      metadata: { org_id: orgId },
    });
    return customer.id;
  }

  app.post(
    "/api/payments/create-intent",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = createIntentSchema.parse(request.body);
      const user = request.user as { sub: string };
      const stripe = requireStripe(reply);
      if (!stripe) return;

      const customerId = await getOrCreateStripeCustomer(stripe, user.sub);

      if (body.campaignId) {
        const campRes = await db.query(
          `select status, organization_id from campaigns where id = $1`,
          [body.campaignId]
        );
        const camp = campRes.rows[0] as { status: string; organization_id: string } | undefined;
        if (!camp) {
          return reply.code(404).send({ error: "Campaign not found" });
        }
        if (camp.organization_id !== body.orgId) {
          return reply.code(400).send({ error: "Campaign does not belong to this organization" });
        }
        if (camp.status !== "active") {
          return reply.code(400).send({ error: "This campaign is not accepting donations" });
        }
      }

      const partnerId = await resolveEducationPartnerId(body.educationPartnerCode);
      const reinvestOptIn = body.reinvestOptIn ?? false;
      const reinvestPct = body.reinvestPct ?? 5;
      const alloc = computeReinvestAllocation(body.amount, reinvestOptIn, reinvestPct, partnerId);

      const donorRow = await db.query(
        `select lower(trim(coalesce(email, ''))) as e, nullif(trim(full_name), '') as full_name
         from users where id = $1`,
        [user.sub]
      );
      const dr = donorRow.rows[0] as { e?: string; full_name?: string } | undefined;
      const donorEmail = String(dr?.e || "").trim() || null;
      const donorName = String(dr?.full_name || "").trim() || null;

      const intentParams: Record<string, unknown> = {
        amount: Math.round(body.amount * 100),
        currency: body.currency,
        customer: customerId,
        payment_method_types: ["card"],
        // Save the payment method to the Customer so the next donation can reuse the saved card.
        // Without this, Stripe will typically require card entry every time.
        setup_future_usage: "on_session",
        metadata: {
          orgId: body.orgId,
          campaignId: body.campaignId || "",
          donorUserId: user.sub,
          type: "donation",
          epId: partnerId || "",
          reinvest: reinvestOptIn ? "1" : "0",
          rAmt: String(alloc.reinvest_amount),
          pAmt: String(alloc.partner_reinvest_amount),
          gAmt: String(alloc.general_reinvest_amount),
        },
      };

      // Platform collects full charge; manual Transfer to Connect after hold period (see webhooks + admin release).

      const intent = await stripe.paymentIntents.create(intentParams as any);

      const ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: customerId },
        { apiVersion: "2024-04-10" }
      );

      await db.query(
        `insert into donations (
           org_id, campaign_id, user_id, donor_email, donor_name, amount, currency, status, stripe_payment_intent_id,
           education_partner_id, reinvest_opt_in, reinvest_amount, partner_reinvest_amount, general_reinvest_amount
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          body.orgId,
          body.campaignId || null,
          user.sub,
          donorEmail,
          donorName,
          body.amount,
          body.currency,
          "pending",
          intent.id,
          partnerId || null,
          reinvestOptIn,
          alloc.reinvest_amount,
          alloc.partner_reinvest_amount,
          alloc.general_reinvest_amount,
        ]
      );

      return {
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
        customerId,
        ephemeralKey: ephemeralKey.secret,
      };
    }
  );

  app.post(
    "/api/payments/donate-checkout",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = donationCheckoutSchema.parse(request.body);
      const user = request.user as { sub: string };
      const stripe = requireStripe(reply);
      if (!stripe) return;

      const customerId = await getOrCreateStripeCustomer(stripe, user.sub);

      const orgRes = await db.query(
        "select name from organizations where id = $1",
        [body.orgId]
      );
      const orgName = (orgRes.rows[0] as Record<string, unknown> | undefined)?.name as string || "Organization";

      let campaignTitle = "";
      if (body.campaignId) {
        const campRes = await db.query(
          "select title from campaigns where id = $1",
          [body.campaignId]
        );
        campaignTitle = (campRes.rows[0] as Record<string, unknown> | undefined)?.title as string || "";
      }

      const description = campaignTitle
        ? `Donation to ${orgName} - ${campaignTitle}`
        : `Donation to ${orgName}`;

      const baseUrl = env.EXPO_PUBLIC_API_URL
        ? env.EXPO_PUBLIC_API_URL.replace(/\/app\/?$/, "").replace(/\/$/, "")
        : `${request.protocol}://${request.hostname}`;

      const successBase = body.returnUrl && body.returnUrl.trim().length > 0
        ? body.returnUrl.trim()
        : `${baseUrl}/api/payments/checkout-success`;

      const successUrl = successBase.includes("?")
        ? `${successBase}&session_id={CHECKOUT_SESSION_ID}`
        : `${successBase}?session_id={CHECKOUT_SESSION_ID}`;

      // Even if the client provides a returnUrl for success, keep cancel separate so we can show a clear
      // "return to app" fallback experience.
      const cancelBase = `${baseUrl}/api/payments/checkout-cancel`;

      const cancelUrl = cancelBase.includes("?")
        ? `${cancelBase}&cancelled=1`
        : `${cancelBase}?cancelled=1`;

      const partnerId = await resolveEducationPartnerId(body.educationPartnerCode);
      const reinvestOptIn = body.reinvestOptIn ?? false;
      const reinvestPct = body.reinvestPct ?? 5;
      const alloc = computeReinvestAllocation(body.amount, reinvestOptIn, reinvestPct, partnerId);

      const checkoutDonorRow = await db.query(
        `select lower(trim(coalesce(email, ''))) as e, nullif(trim(full_name), '') as full_name
         from users where id = $1`,
        [user.sub]
      );
      const cdr = checkoutDonorRow.rows[0] as { e?: string; full_name?: string } | undefined;
      const checkoutDonorEmail = String(cdr?.e || "").trim() || null;
      const checkoutDonorName = String(cdr?.full_name || "").trim() || null;

      const donationMeta = {
        orgId: body.orgId,
        campaignId: body.campaignId || "",
        donorUserId: user.sub,
        type: "donation",
        epId: partnerId || "",
        reinvest: reinvestOptIn ? "1" : "0",
        rAmt: String(alloc.reinvest_amount),
        pAmt: String(alloc.partner_reinvest_amount),
        gAmt: String(alloc.general_reinvest_amount),
      };

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        line_items: [
          {
            price_data: {
              currency: body.currency,
              unit_amount: Math.round(body.amount * 100),
              product_data: {
                name: description,
              },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          metadata: donationMeta,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: donationMeta,
      });

      const piIdAfterCreate = stripeId(session.payment_intent);
      const donationStripeKey = piIdAfterCreate ?? session.id;
      if (piIdAfterCreate) {
        await stripe.paymentIntents.update(piIdAfterCreate, {
          metadata: {
            ...Object.fromEntries(Object.entries(donationMeta).map(([k, v]) => [k, String(v ?? "")])),
            checkoutSessionId: session.id,
          },
        });
      }

      await db.query(
        `insert into donations (
           org_id, campaign_id, user_id, donor_email, donor_name, amount, currency, status, stripe_payment_intent_id,
           education_partner_id, reinvest_opt_in, reinvest_amount, partner_reinvest_amount, general_reinvest_amount
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          body.orgId,
          body.campaignId || null,
          user.sub,
          checkoutDonorEmail,
          checkoutDonorName,
          body.amount,
          body.currency,
          "pending",
          donationStripeKey,
          partnerId || null,
          reinvestOptIn,
          alloc.reinvest_amount,
          alloc.partner_reinvest_amount,
          alloc.general_reinvest_amount,
        ]
      );

      return { url: session.url, sessionId: session.id };
    }
  );

  app.get("/api/payments/checkout-status", async (request, reply) => {
    const q = request.query as { session_id?: string };
    const sessionId = q.session_id;
    if (!sessionId) {
      return reply.code(400).send({ error: "Missing session_id" });
    }

    const stripe = requireStripe(reply);
    if (!stripe) return;

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const paymentIntentId = stripeId(session.payment_intent as string | { id?: string } | null);
      type DonationRow = {
        status: string;
        amount: number;
        currency: string;
        org_id: string | null;
        campaign_id: string | null;
      };
      let donationOut: DonationRow | null = null;

      const tryDonationLookup = async (key: string): Promise<void> => {
        const donRes = await db.query(
          `select org_id, campaign_id, amount, currency, status
           from donations
           where stripe_payment_intent_id = $1
           limit 1`,
          [key]
        );
        if (donRes.rowCount && donRes.rows[0]) {
          const row = donRes.rows[0] as Record<string, unknown>;
          donationOut = {
            status: String(row.status ?? ""),
            amount: Number(row.amount),
            currency: String(row.currency ?? "usd"),
            org_id: (row.org_id as string | null) ?? null,
            campaign_id: (row.campaign_id as string | null) ?? null,
          };
        }
      };

      if (paymentIntentId) {
        await tryDonationLookup(paymentIntentId);
      }
      if (!donationOut) {
        await tryDonationLookup(sessionId);
      }

      const sess = session as { payment_status?: string; amount_total?: number | null; currency?: string | null };
      const donationForResponse = donationOut as DonationRow | null;
      return {
        sessionId,
        paymentStatus: sess.payment_status,
        amountTotal: typeof sess.amount_total === "number" ? sess.amount_total / 100 : null,
        currency: sess.currency || donationForResponse?.currency || "usd",
        donation: donationForResponse,
      };
    } catch (e: any) {
      request.log.error({ err: e }, "Failed to fetch checkout session status");
      return reply.code(400).send({ error: "Invalid or expired session" });
    }
  });

  app.get("/api/payments/checkout-success", async (request, reply) => {
    const q = request.query as { session_id?: string };
    const sessionId = q.session_id ? String(q.session_id) : "";
    const deepLink = sessionId
      ? `giveblack://checkout-result?session_id=${encodeURIComponent(sessionId)}`
      : "giveblack://checkout-result";

    return reply.type("text/html").send(`
      <!DOCTYPE html>
      <html><head><title>Payment Successful</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fff; }
        .card { text-align: center; padding: 40px; max-width: 520px; }
        .icon { font-size: 64px; margin-bottom: 16px; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        p { color: #999; font-size: 16px; margin-bottom: 24px; }
        .btn { background: #059669; color: #fff; border: none; padding: 14px 32px; border-radius: 12px; font-size: 16px; cursor: pointer; text-decoration: none; display: inline-block; }
        .hint { color: #777; font-size: 13px; line-height: 18px; margin-top: 14px; }
      </style>
      </head><body>
        <div class="card">
          <div class="icon">&#10003;</div>
          <h1>Payment Successful</h1>
          <p>Thank you for your donation! Returning you to the app to show your receipt.</p>
          <a href="${deepLink}" class="btn">Return to app</a>
          <div class="hint">
            If the app doesn’t open automatically, tap “Return to app”.
          </div>
        </div>
        <script>
          (function () {
            var url = ${JSON.stringify(deepLink)};
            // Attempt immediately
            window.location.href = url;
            // Then again shortly after (some Safari contexts need a second attempt)
            setTimeout(function () { window.location.href = url; }, 600);
          })();
        </script>
      </body></html>
    `);
  });

  app.get("/api/payments/checkout-cancel", async (request, reply) => {
    const deepLink = "giveblack://checkout-result?cancelled=1";
    return reply.type("text/html").send(`
      <!DOCTYPE html>
      <html><head><title>Payment Cancelled</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fff; }
        .card { text-align: center; padding: 40px; max-width: 520px; }
        .icon { font-size: 64px; margin-bottom: 16px; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        p { color: #999; font-size: 16px; margin-bottom: 24px; }
        .btn { background: #059669; color: #fff; border: none; padding: 14px 32px; border-radius: 12px; font-size: 16px; cursor: pointer; text-decoration: none; display: inline-block; }
        .hint { color: #777; font-size: 13px; line-height: 18px; margin-top: 14px; }
      </style>
      </head><body>
        <div class="card">
          <div class="icon">&#10007;</div>
          <h1>Payment Cancelled</h1>
          <p>Your donation was not processed. Return to the app to try again.</p>
          <a href="${deepLink}" class="btn">Return to app</a>
          <div class="hint">
            If the app doesn’t open automatically, tap “Return to app”.
          </div>
        </div>
        <script>
          (function () {
            var url = ${JSON.stringify(deepLink)};
            window.location.href = url;
            setTimeout(function () { window.location.href = url; }, 600);
          })();
        </script>
      </body></html>
    `);
  });

  app.get("/api/payments/guest-checkout-success", async (request, reply) => {
    const q = request.query as { session_id?: string };
    const sessionId = q.session_id;

    const baseUrl = env.EXPO_PUBLIC_API_URL
      ? env.EXPO_PUBLIC_API_URL.replace(/\/app\/?$/, "").replace(/\/$/, "")
      : `${request.protocol}://${request.hostname}`;
    const signupUrl = `${baseUrl}/donor-signup`;

    const stripe = requireStripe(reply);
    if (!stripe || !sessionId) {
      return reply.type("text/html").send(`
        <!DOCTYPE html>
        <html><head><title>Payment Successful</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fff; }
          .card { text-align: center; padding: 40px; max-width: 480px; }
          .icon { font-size: 64px; margin-bottom: 16px; }
          h1 { font-size: 24px; margin-bottom: 8px; }
          p { color: #999; font-size: 16px; margin-bottom: 24px; }
          .btn { background: #059669; color: #fff; border: none; padding: 14px 32px; border-radius: 12px; font-size: 16px; cursor: pointer; text-decoration: none; display: inline-block; margin-top: 8px; }
        </style>
        </head><body>
          <div class="card">
            <div class="icon">&#10003;</div>
            <h1>Payment Successful</h1>
            <p>Thank you for your donation! A receipt will be sent to your email.</p>
            <p>Create a free account to track your donations and access donor features.</p>
            <a href="${signupUrl}" class="btn">Create Free Account</a>
          </div>
        </body></html>
      `);
    }

    let guestEmailForReceipt: string | null = null;
    let orgNameForReceipt: string | null = null;
    let amountForReceipt: number | null = null;

    const escapeHtml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const md = (session.metadata || {}) as Record<string, string>;
      guestEmailForReceipt = md.donorEmail || null;

      if (session.payment_status === "paid") {
        const piId = stripeId(session.payment_intent as string | { id?: string } | null);
        if (piId) {
          const donStatusRes = await db.query(
            `select status from donations
             where stripe_payment_intent_id = $1 or stripe_payment_intent_id = $2
             order by created_at desc limit 1`,
            [piId, sessionId]
          );
          const wasPending = (donStatusRes.rows[0] as { status?: string } | undefined)?.status === "pending";

          const client = await db.connect();
          try {
            await client.query("BEGIN");
            await client.query(
              `update donations set stripe_payment_intent_id = $1
               where stripe_payment_intent_id = $2 and status = 'pending'`,
              [piId, sessionId]
            );
            const piObj = await stripe.paymentIntents.retrieve(piId);
            await applyDonationFromSucceededPaymentIntent(client, piObj as unknown as Record<string, unknown>);
            await client.query("COMMIT");
          } catch (e) {
            await client.query("ROLLBACK").catch(() => {});
            request.log.error({ err: e }, "guest-checkout-success: finalize failed");
          } finally {
            client.release();
          }

          if (wasPending && guestEmailForReceipt && md.orgId) {
            try {
              const orgRes = await db.query("select name from organizations where id = $1", [md.orgId]);
              orgNameForReceipt = (orgRes.rows[0] as Record<string, unknown> | undefined)?.name as string || null;
              amountForReceipt = session.amount_total ? session.amount_total / 100 : null;

              if (orgNameForReceipt && amountForReceipt !== null) {
                const { sendBrevoEmail } = await import("../services/brevo.js");
                const { emailLayout, ctaButton } = await import("../services/email-template.js");
                const amountStr = `$${amountForReceipt.toFixed(2)}`;
                const content = `
                  <h2 style="color:#ffffff;margin:0 0 8px 0;font-size:22px;">Thank You for Your Donation!</h2>
                  <p style="color:#cccccc;margin:0 0 24px 0;font-size:16px;">Your donation of <strong style="color:#059669;">${amountStr}</strong> to <strong>${orgNameForReceipt}</strong> has been received.</p>
                  <div style="background:#1a1a1a;border:1px solid #222222;border-radius:12px;padding:24px;margin-bottom:24px;">
                    <p style="color:#999999;margin:0 0 8px 0;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Donation Summary</p>
                    <p style="color:#ffffff;margin:0 0 4px 0;font-size:16px;"><strong>Organization:</strong> ${orgNameForReceipt}</p>
                    <p style="color:#ffffff;margin:0;font-size:16px;"><strong>Amount:</strong> ${amountStr}</p>
                  </div>
                  <p style="color:#cccccc;margin:0 0 24px 0;font-size:15px;">Want to track your donations and access exclusive donor features? Create a free GiveBlack account.</p>
                  ${ctaButton("https://giveblackapp.com", "Create Free Account")}
                  <p style="color:#999999;margin:24px 0 0 0;font-size:13px;">Thank you for making a difference in your community.</p>
                `;
                await sendBrevoEmail({
                  to: guestEmailForReceipt,
                  subject: `Your donation to ${orgNameForReceipt} - Receipt`,
                  html: emailLayout(content),
                  tags: ["giveblack", "donation-receipt", "guest"],
                });
              }
            } catch (emailErr) {
              request.log.error({ err: emailErr }, "guest-checkout-success: receipt email failed");
            }
          }
        }
      }
    } catch (e) {
      request.log.error({ err: e }, "guest-checkout-success: session retrieval failed");
    }

    const safeEmail = guestEmailForReceipt ? escapeHtml(guestEmailForReceipt) : null;

    return reply.type("text/html").send(`
      <!DOCTYPE html>
      <html><head><title>Payment Successful</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fff; }
        .card { text-align: center; padding: 40px; max-width: 480px; width: 100%; box-sizing: border-box; }
        .icon { font-size: 64px; margin-bottom: 16px; color: #059669; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        p { color: #999; font-size: 16px; margin-bottom: 16px; }
        .highlight { color: #059669; }
        .divider { border: none; border-top: 1px solid #222; margin: 24px 0; }
        .upsell { background: #111; border: 1px solid #222; border-radius: 16px; padding: 24px; margin-bottom: 24px; }
        .upsell h2 { font-size: 18px; margin: 0 0 8px 0; color: #fff; }
        .upsell p { color: #999; font-size: 14px; margin: 0 0 16px 0; }
        .btn { background: #059669; color: #fff; border: none; padding: 14px 32px; border-radius: 12px; font-size: 16px; cursor: pointer; text-decoration: none; display: inline-block; font-weight: 600; }
      </style>
      </head><body>
        <div class="card">
          <div class="icon">&#10003;</div>
          <h1>Donation Complete!</h1>
          ${safeEmail ? `<p>A receipt is being sent to <span class="highlight">${safeEmail}</span>.</p>` : "<p>Thank you for your donation!</p>"}
          <hr class="divider" />
          <div class="upsell">
            <h2>Track your giving</h2>
            <p>Create a free GiveBlack account to see your donation history, download receipts, and support more causes.</p>
            <a href="${signupUrl}" class="btn">Create Free Account</a>
          </div>
        </div>
      </body></html>
    `);
  });

  app.post(
    "/api/payments/topup-intent",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = topupIntentSchema.parse(request.body);
      const user = request.user as { sub: string };
      const stripe = requireStripe(reply);
      if (!stripe) return;

      const customerId = await getOrCreateStripeCustomer(stripe, user.sub);

      const intent = await stripe.paymentIntents.create({
        amount: Math.round(body.amount * 100),
        currency: body.currency,
        customer: customerId,
        payment_method_types: ["card"],
        metadata: {
          userId: user.sub,
          type: "wallet_topup",
        },
      });

      const ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: customerId },
        { apiVersion: "2024-04-10" }
      );

      return {
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
        customerId,
        ephemeralKey: ephemeralKey.secret,
      };
    }
  );

  app.post(
    "/api/payments/topup-checkout",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = topupIntentSchema.parse(request.body);
      const user = request.user as { sub: string };
      const stripe = requireStripe(reply);
      if (!stripe) return;

      const customerId = await getOrCreateStripeCustomer(stripe, user.sub);

      const baseUrl = env.EXPO_PUBLIC_API_URL
        ? env.EXPO_PUBLIC_API_URL.replace(/\/app\/?$/, "").replace(/\/$/, "")
        : `${request.protocol}://${request.hostname}`;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        line_items: [
          {
            price_data: {
              currency: body.currency,
              unit_amount: Math.round(body.amount * 100),
              product_data: {
                name: `GiveBlack Wallet Top-up - $${body.amount}`,
              },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          metadata: {
            userId: user.sub,
            type: "wallet_topup",
          },
        },
        success_url: `${baseUrl}/api/payments/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/api/payments/checkout-cancel`,
      });

      return { url: session.url, sessionId: session.id };
    }
  );

  app.get("/api/account/transactions", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { sub: string };
    const userRes = await db.query(
      "select lower(trim(coalesce(email, ''))) as email from users where id = $1",
      [user.sub]
    );
    const userEmail = String((userRes.rows[0] as { email?: string } | undefined)?.email || "");
    const historyRes = await db.query(
      `select
         d.id::text as id,
         d.amount::numeric as amount,
         'donation'::text as type,
         coalesce(nullif(o.name, ''), nullif(d.message, ''), 'Donation')::text as title,
         d.status::text as status,
         d.created_at as date,
         o.name::text as org_name
       from donations d
       left join organizations o on o.id = d.org_id
       where (
         d.user_id = $1::uuid
         or (
           $2 <> ''
           and lower(trim(coalesce(d.donor_email, ''))) = $2
           and (d.user_id is null or d.user_id = $1::uuid)
         )
       )

       union all

       select
         t.id::text as id,
         t.amount::numeric as amount,
         coalesce(nullif(t.type, ''), 'topup')::text as type,
         coalesce(nullif(t.description, ''), 'Wallet top-up')::text as title,
         'succeeded'::text as status,
         t.created_at as date,
         null::text as org_name
       from transactions t
       where t.user_id = $1::uuid

       order by date desc`,
      [user.sub, userEmail]
    );

    const transactions = historyRes.rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id ?? ""),
        amount: Number(r.amount ?? 0),
        type: String(r.type ?? "transaction"),
        title: String(r.title ?? "Transaction"),
        status: String(r.status ?? "pending"),
        date: String(r.date ?? ""),
        org_name: r.org_name ? String(r.org_name) : undefined,
      };
    });

    return { transactions };
  });

  app.post("/api/subscriptions/create-checkout", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = checkoutSchema.parse(request.body);
    const user = request.user as { sub: string };
    const stripe = requireStripe(reply);
    if (!stripe) return;

    const orgRes = await db.query(
      "select id, name, contact_email, stripe_account_id from organizations where id = $1",
      [body.org_id]
    );
    const org = orgRes.rows[0] as Record<string, unknown> | undefined;
    if (!org) return reply.code(404).send({ error: "Organization not found" });

    const userRes = await db.query("select email, role from users where id = $1", [user.sub]);
    const callerUser = userRes.rows[0] as { email: string; role: string } | undefined;
    if (!callerUser) return reply.code(401).send({ error: "User not found" });
    const isAdmin = callerUser.role === "admin";
    const isOrgOwner = await userOwnsOrganization(user.sub, callerUser.email, org);
    if (!isAdmin && !isOrgOwner) {
      return reply.code(403).send({ error: "You are not authorized to manage billing for this organization" });
    }

    const customerId = await getOrCreateOrgStripeCustomer(
      stripe,
      body.org_id,
      org.name as string,
      (org.contact_email as string) || null
    );

    const priceId = priceIdForTier(body.tier);
    const successUrl = body.success_url || `${request.headers.origin || request.headers.referer || "https://giveblackapp.com"}/subscription-success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = body.cancel_url || `${request.headers.origin || request.headers.referer || "https://giveblackapp.com"}/subscription-cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { org_id: body.org_id, tier: body.tier },
      subscription_data: {
        metadata: { org_id: body.org_id, tier: body.tier },
      },
    });

    return { url: session.url, sessionId: session.id };
  });

  app.post("/api/subscriptions/create-native-intent", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = mobileSubscriptionSchema.parse(request.body);
    const user = request.user as { sub: string };
    const stripe = requireStripe(reply);
    if (!stripe) return;

    const orgRes = await db.query(
      "select id, name, contact_email from organizations where id = $1",
      [body.org_id]
    );
    const org = orgRes.rows[0] as Record<string, unknown> | undefined;
    if (!org) return reply.code(404).send({ error: "Organization not found" });

    const userRes = await db.query("select email, role from users where id = $1", [user.sub]);
    const callerUser = userRes.rows[0] as { email: string; role: string } | undefined;
    if (!callerUser) return reply.code(401).send({ error: "User not found" });
    const isAdmin = callerUser.role === "admin";
    const isOrgOwner = await userOwnsOrganization(user.sub, callerUser.email, org);
    if (!isAdmin && !isOrgOwner) {
      return reply.code(403).send({ error: "You are not authorized to manage billing for this organization" });
    }

    const subRes = await db.query(
      "select stripe_subscription_id from org_subscriptions where org_id = $1 order by created_at desc limit 1",
      [body.org_id]
    );
    const existingSubscriptionId =
      (subRes.rows[0] as Record<string, unknown> | undefined)?.stripe_subscription_id as string | null;
    const customerId = await getOrCreateOrgStripeCustomer(
      stripe,
      body.org_id,
      org.name as string,
      (org.contact_email as string) || null
    );

    const priceId = priceIdForTier(body.tier);
    let stripeSubscription: any = null;

    if (existingSubscriptionId) {
      try {
        const existing = await stripe.subscriptions.retrieve(existingSubscriptionId);
        const existingItemId = existing.items?.data?.[0]?.id as string | undefined;
        if (existingItemId) {
          stripeSubscription = await stripe.subscriptions.update(existingSubscriptionId, {
            items: [{ id: existingItemId, price: priceId }],
            payment_behavior: "default_incomplete",
            proration_behavior: "always_invoice",
            metadata: { org_id: body.org_id, tier: body.tier },
            expand: ["latest_invoice.payment_intent"],
          });
        }
      } catch {
        stripeSubscription = null;
      }
    }

    if (!stripeSubscription) {
      stripeSubscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: "default_incomplete",
        payment_settings: {
          save_default_payment_method: "on_subscription",
        },
        metadata: { org_id: body.org_id, tier: body.tier },
        expand: ["latest_invoice.payment_intent"],
      });
    }

    await upsertOrgSubscriptionFromStripe(stripeSubscription as Record<string, unknown>, body.org_id);

    // Stripe may return a latest invoice without a PaymentIntent when the invoice isn't finalized yet
    // (observed with payment_behavior=default_incomplete). Finalize to ensure a PaymentIntent exists.
    let invoice = stripeSubscription.latest_invoice as unknown;
    let clientSecret: string | null = null;
    try {
      const invId =
        typeof invoice === "string"
          ? invoice
          : invoice && typeof invoice === "object" && invoice !== null && "id" in invoice
            ? String((invoice as { id?: string }).id || "")
            : "";

      const paymentIntentFromInvoice = (inv: any): any => inv?.payment_intent ?? null;

      if (invId) {
        const invObj = await stripe.invoices.retrieve(invId, { expand: ["payment_intent"] });
        const pi = paymentIntentFromInvoice(invObj);
        clientSecret = (pi?.client_secret as string | undefined) || null;

        if (!clientSecret && invObj?.status === "open" && invObj?.collection_method === "charge_automatically") {
          const finalized = await stripe.invoices.finalizeInvoice(invId, { expand: ["payment_intent"] });
          const fpi = paymentIntentFromInvoice(finalized);
          clientSecret = (fpi?.client_secret as string | undefined) || null;
        }
      }
    } catch {
      // Ignore finalization errors; fall back to SetupIntent if needed.
    }

    let setupIntentClientSecret: string | null = null;

    // If Stripe does not require immediate payment (e.g., invoice auto-paid/proration = 0),
    // still collect/update payment method through SetupIntent so native checkout is shown.
    if (!clientSecret) {
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        usage: "off_session",
        automatic_payment_methods: { enabled: true },
        metadata: {
          org_id: body.org_id,
          tier: body.tier,
          type: "org_subscription_setup",
        },
      });
      setupIntentClientSecret = setupIntent.client_secret ?? null;
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2024-04-10" }
    );

    return {
      customerId,
      ephemeralKey: ephemeralKey.secret,
      clientSecret,
      setupIntentClientSecret,
      subscriptionId: stripeSubscription.id as string,
      requiresPayment: Boolean(clientSecret || setupIntentClientSecret),
      status: stripeSubscription.status as string,
      tier: body.tier,
    };
  });

  app.post("/api/subscriptions/sync-native", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = syncSubscriptionSchema.parse(request.body);
    const user = request.user as { sub: string };
    const stripe = requireStripe(reply);
    if (!stripe) return;

    const orgRes = await db.query(
      "select id, name, contact_email from organizations where id = $1",
      [body.org_id]
    );
    const org = orgRes.rows[0] as Record<string, unknown> | undefined;
    if (!org) return reply.code(404).send({ error: "Organization not found" });

    const userRes = await db.query("select email, role from users where id = $1", [user.sub]);
    const callerUser = userRes.rows[0] as { email: string; role: string } | undefined;
    if (!callerUser) return reply.code(401).send({ error: "User not found" });
    const isAdmin = callerUser.role === "admin";
    const isOrgOwner = await userOwnsOrganization(user.sub, callerUser.email, org);
    if (!isAdmin && !isOrgOwner) {
      return reply.code(403).send({ error: "You are not authorized to manage billing for this organization" });
    }

    let subscriptionId = body.subscription_id || "";
    if (!subscriptionId) {
      const subRes = await db.query(
        "select stripe_subscription_id from org_subscriptions where org_id = $1 and stripe_subscription_id is not null order by created_at desc limit 1",
        [body.org_id]
      );
      subscriptionId = String((subRes.rows[0] as Record<string, unknown> | undefined)?.stripe_subscription_id || "");
    }
    if (!subscriptionId) {
      request.log.warn(
        { orgId: body.org_id, callerUserId: user.sub, providedSubscriptionId: body.subscription_id || null },
        "sync-native: missing subscription id"
      );
      return reply.code(400).send({ error: "No subscription found for this organization" });
    }

    let stripeSub: unknown;
    try {
      stripeSub = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["latest_invoice.payment_intent"],
      });
    } catch (err) {
      request.log.error(
        { err, orgId: body.org_id, callerUserId: user.sub, subscriptionId },
        "sync-native: Stripe subscription retrieve failed"
      );
      return reply.code(502).send({ error: "Unable to sync subscription from Stripe. Please try again." });
    }

    // If the subscription is still incomplete after a SetupIntent-only PaymentSheet flow,
    // attempt to pay the open invoice using the customer's most recent saved payment method.
    // This makes "test card paid" upgrades reflect immediately without relying on webhooks.
    try {
      const s: any = stripeSub as any;
      const latestInvoice = s?.latest_invoice;
      const invId =
        typeof latestInvoice === "string"
          ? latestInvoice
          : latestInvoice && typeof latestInvoice === "object" && latestInvoice !== null && "id" in latestInvoice
            ? String((latestInvoice as { id?: string }).id || "")
            : "";
      const invStatus =
        latestInvoice && typeof latestInvoice === "object" && latestInvoice !== null
          ? String((latestInvoice as any).status || "")
          : "";
      const amountDue =
        latestInvoice && typeof latestInvoice === "object" && latestInvoice !== null
          ? Number((latestInvoice as any).amount_due ?? 0)
          : 0;

      const customerId = String(s?.customer || "");
      const shouldAttemptPay =
        String(s?.status || "") === "incomplete" && invId && invStatus === "open" && amountDue > 0 && customerId;

      if (shouldAttemptPay) {
        const pms = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
        const pm = pms?.data?.[0];
        if (pm?.id) {
          await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
          await stripe.invoices.pay(invId);
          stripeSub = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ["latest_invoice.payment_intent"],
          });
        }
      }
    } catch {
      // best-effort
    }

    const subAsRecord = stripeSub as unknown as Record<string, unknown>;
    applySubscriptionPaidHeuristic(subAsRecord);

    let saved: Awaited<ReturnType<typeof upsertOrgSubscriptionFromStripe>>;
    try {
      saved = await upsertOrgSubscriptionFromStripe(subAsRecord, body.org_id);
    } catch (err) {
      request.log.error(
        { err, orgId: body.org_id, callerUserId: user.sub, subscriptionId },
        "sync-native: subscription upsert failed"
      );
      return reply.code(500).send({ error: "Subscription sync failed. Please try again." });
    }
    return {
      org_id: saved.orgId,
      subscription: {
        id: saved.subscriptionId,
        tier: saved.tier,
        status: saved.status,
        current_period_end: saved.currentPeriodEnd,
        cancel_at_period_end: saved.cancelAtPeriodEnd,
      },
    };
  });

  app.post("/api/subscriptions/cancel-native", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = syncSubscriptionSchema.parse(request.body);
    const user = request.user as { sub: string };
    const stripe = requireStripe(reply);
    if (!stripe) return;

    const orgRes = await db.query(
      "select id, name, contact_email from organizations where id = $1",
      [body.org_id]
    );
    const org = orgRes.rows[0] as Record<string, unknown> | undefined;
    if (!org) return reply.code(404).send({ error: "Organization not found" });

    const userRes = await db.query("select email, role from users where id = $1", [user.sub]);
    const callerUser = userRes.rows[0] as { email: string; role: string } | undefined;
    if (!callerUser) return reply.code(401).send({ error: "User not found" });
    const isAdmin = callerUser.role === "admin";
    const isOrgOwner = await userOwnsOrganization(user.sub, callerUser.email, org);
    if (!isAdmin && !isOrgOwner) {
      return reply.code(403).send({ error: "You are not authorized to manage billing for this organization" });
    }

    let subscriptionId = body.subscription_id || "";
    if (!subscriptionId) {
      const subRes = await db.query(
        "select stripe_subscription_id from org_subscriptions where org_id = $1 and stripe_subscription_id is not null order by created_at desc limit 1",
        [body.org_id]
      );
      subscriptionId = String((subRes.rows[0] as Record<string, unknown> | undefined)?.stripe_subscription_id || "");
    }
    if (!subscriptionId) return reply.code(400).send({ error: "No subscription found for this organization" });

    const updated = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    const saved = await upsertOrgSubscriptionFromStripe(updated as unknown as Record<string, unknown>, body.org_id);
    return {
      success: true,
      org_id: saved.orgId,
      subscription: {
        id: saved.subscriptionId,
        tier: saved.tier,
        status: saved.status,
        current_period_end: saved.currentPeriodEnd,
        cancel_at_period_end: saved.cancelAtPeriodEnd,
      },
    };
  });

  app.post("/api/subscriptions/resume-native", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = syncSubscriptionSchema.parse(request.body);
    const user = request.user as { sub: string };
    const stripe = requireStripe(reply);
    if (!stripe) return;

    const orgRes = await db.query(
      "select id, name, contact_email from organizations where id = $1",
      [body.org_id]
    );
    const org = orgRes.rows[0] as Record<string, unknown> | undefined;
    if (!org) return reply.code(404).send({ error: "Organization not found" });

    const userRes = await db.query("select email, role from users where id = $1", [user.sub]);
    const callerUser = userRes.rows[0] as { email: string; role: string } | undefined;
    if (!callerUser) return reply.code(401).send({ error: "User not found" });
    const isAdmin = callerUser.role === "admin";
    const isOrgOwner = await userOwnsOrganization(user.sub, callerUser.email, org);
    if (!isAdmin && !isOrgOwner) {
      return reply.code(403).send({ error: "You are not authorized to manage billing for this organization" });
    }

    let subscriptionId = body.subscription_id || "";
    if (!subscriptionId) {
      const subRes = await db.query(
        "select stripe_subscription_id from org_subscriptions where org_id = $1 and stripe_subscription_id is not null order by created_at desc limit 1",
        [body.org_id]
      );
      subscriptionId = String((subRes.rows[0] as Record<string, unknown> | undefined)?.stripe_subscription_id || "");
    }
    if (!subscriptionId) return reply.code(400).send({ error: "No subscription found for this organization" });

    const updated = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
    const saved = await upsertOrgSubscriptionFromStripe(updated as unknown as Record<string, unknown>, body.org_id);
    return {
      success: true,
      org_id: saved.orgId,
      subscription: {
        id: saved.subscriptionId,
        tier: saved.tier,
        status: saved.status,
        current_period_end: saved.currentPeriodEnd,
        cancel_at_period_end: saved.cancelAtPeriodEnd,
      },
    };
  });

  app.post("/api/subscriptions/create-portal-session", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = portalSchema.parse(request.body);
    const user = request.user as { sub: string };
    const stripe = requireStripe(reply);
    if (!stripe) return;

    const orgRes = await db.query(
      "select id, contact_email from organizations where id = $1",
      [body.org_id]
    );
    const org = orgRes.rows[0] as Record<string, unknown> | undefined;
    if (!org) return reply.code(404).send({ error: "Organization not found" });

    const userRes = await db.query("select email, role from users where id = $1", [user.sub]);
    const callerUser = userRes.rows[0] as { email: string; role: string } | undefined;
    if (!callerUser) return reply.code(401).send({ error: "User not found" });
    const isAdmin = callerUser.role === "admin";
    const isOrgOwner = await userOwnsOrganization(user.sub, callerUser.email, org);
    if (!isAdmin && !isOrgOwner) {
      return reply.code(403).send({ error: "You are not authorized to manage billing for this organization" });
    }

    const subRes = await db.query(
      "select stripe_customer_id from org_subscriptions where org_id = $1 and stripe_customer_id is not null order by created_at desc limit 1",
      [body.org_id]
    );
    const customerId = (subRes.rows[0] as Record<string, unknown> | undefined)?.stripe_customer_id as string | null;
    if (!customerId) return reply.code(400).send({ error: "No billing customer for this organization" });

    const returnUrl = body.return_url || `${request.headers.origin || request.headers.referer || "https://giveblackapp.com"}`;
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  });

  app.get("/api/charity/my-subscription", { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { sub: string };
    const userRes = await db.query("select email from users where id = $1", [user.sub]);
    const email = (userRes.rows[0] as { email: string } | undefined)?.email;
    if (!email) return reply.code(401).send({ error: "User not found" });

    let orgId: string | null = null;
    const orgRes = await db.query(
      "select id from organizations where lower(trim(contact_email)) = lower(trim($1)) limit 1",
      [email]
    );
    orgId = (orgRes.rows[0] as Record<string, unknown> | undefined)?.id as string | null;

    if (!orgId) {
      const fallbackOrgRes = await db.query(
        `select o.id
         from charity_requests cr
         join organizations o
           on (
             regexp_replace(lower(coalesce(o.name, '')), '[^a-z0-9]', '', 'g') =
             regexp_replace(lower(coalesce(cr.charity_name, '')), '[^a-z0-9]', '', 'g')
             or lower(coalesce(o.contact_email, '')) = lower(coalesce(cr.contact_email, ''))
           )
         where cr.status = 'approved'
           and (
             cr.user_id = $1
             or lower(coalesce(cr.contact_email, '')) = lower(coalesce($2, ''))
           )
         order by cr.reviewed_at desc nulls last, cr.created_at desc
         limit 1`,
        [user.sub, email]
      );
      orgId = (fallbackOrgRes.rows[0] as Record<string, unknown> | undefined)?.id as string | null;
    }

    if (!orgId) {
      return {
        org_id: null,
        subscription: { tier: "free", status: "active", current_period_end: null, limits: TIER_LIMITS.free },
        stripe_subscription_id: null,
        community_campaign_count: 0,
        organization_campaign_count: 0,
      };
    }

    const subRes = await db.query(
      `select * from org_subscriptions where org_id = $1
       order by
         (stripe_subscription_id is not null) desc,
         case when status in ('active', 'trialing') then 1 else 0 end desc,
         updated_at desc nulls last,
         created_at desc
       limit 1`,
      [orgId]
    );
    const sub = subRes.rows[0] as Record<string, unknown> | undefined;
    const tier = (sub?.tier as string) || "free";
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;

    const countRes = await db.query(
      "select count(*)::int as c from community_campaigns where creator_id = $1",
      [user.sub]
    );
    const campaignCount = Number((countRes.rows[0] as Record<string, unknown>)?.c ?? 0);

    const orgCampRes = await db.query(
      "select count(*)::int as c from campaigns where organization_id = $1",
      [orgId]
    );
    const organizationCampaignCount = Number((orgCampRes.rows[0] as Record<string, unknown>)?.c ?? 0);

    return {
      org_id: orgId,
      stripe_subscription_id: (sub?.stripe_subscription_id as string | null) ?? null,
      subscription: {
        tier,
        status: (sub?.status as string) || "active",
        current_period_end: sub?.current_period_end || null,
        cancel_at_period_end: sub?.cancel_at_period_end || false,
        limits,
      },
      community_campaign_count: campaignCount,
      organization_campaign_count: organizationCampaignCount,
    };
  });

  app.get("/api/subscriptions/org/:orgId/features", async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    const subRes = await db.query(
      `select tier, status from org_subscriptions where org_id = $1 and status in ('active', 'trialing')
       order by
         (stripe_subscription_id is not null) desc,
         updated_at desc nulls last,
         created_at desc
       limit 1`,
      [orgId]
    );
    const sub = subRes.rows[0] as Record<string, unknown> | undefined;
    const tier = (sub?.tier as string) || "free";
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;

    const featureList: string[] = [];
    if (tier === "free") {
      featureList.push(
        "1 community campaign",
        "Up to $5,000 goal per campaign",
        "14-day payout hold before funds transfer",
        "Standard support"
      );
    } else if (tier === "growth") {
      featureList.push(
        "5 community campaigns",
        "Up to $50,000 goal per campaign",
        "7-day payout hold before funds transfer",
        "Volunteer signup",
        "Everything in Free",
        "Priority support"
      );
    } else if (tier === "institutional") {
      featureList.push(
        "Unlimited community campaigns",
        "Unlimited goal per campaign",
        "7-day payout hold before funds transfer",
        "Volunteer signup",
        "Everything in Growth",
        "Dedicated support"
      );
    }

    return {
      tier,
      status: (sub?.status as string) || "active",
      features: featureList,
      limits,
    };
  });

  /**
   * Native donation path: same DB updates as payment_intent.succeeded webhook.
   * Idempotent when the donation row is already succeeded (markDonation returns 0 rows).
   */
  async function applyDonationFromSucceededPaymentIntent(client: PoolClient, pi: Record<string, unknown>): Promise<void> {
    const metadata = (pi.metadata || {}) as Record<string, string>;
    const grossCents = Number(pi.amount ?? 0);
    let donationRes = await markDonationSucceededWithPayout(client, String(pi.id), grossCents);

    if (
      (!donationRes.rowCount || donationRes.rowCount === 0) &&
      metadata.checkoutSessionId &&
      String(metadata.checkoutSessionId).startsWith("cs_")
    ) {
      await client.query(
        `update donations
         set stripe_payment_intent_id = $1
         where stripe_payment_intent_id = $2 and status = 'pending'`,
        [String(pi.id), metadata.checkoutSessionId]
      );
      donationRes = await markDonationSucceededWithPayout(client, String(pi.id), grossCents);
    }

    if (donationRes.rowCount && donationRes.rowCount > 0) {
      const donation = donationRes.rows[0] as {
        campaign_id: string | null;
        amount: string;
        org_id: string | null;
      };
      if (donation.campaign_id) {
        await client.query(
          `update campaigns set raised = raised + $1, donor_count = donor_count + 1, updated_at = now() where id = $2`,
          [donation.amount, donation.campaign_id]
        );

        const campRes = await client.query(
          `select id, title, raised, goal, status, organization_id from campaigns where id = $1`,
          [donation.campaign_id]
        );
        const camp = campRes.rows[0] as Record<string, unknown> | undefined;

        if (camp?.organization_id) {
          await incrementOrgTotalsFromDonation(client, camp.organization_id as string, donation.amount);
        }

        if (camp && camp.status === "active" && Number(camp.raised) >= Number(camp.goal) && Number(camp.goal) > 0) {
          await client.query(
            `update campaigns set status = 'completed', updated_at = now() where id = $1`,
            [donation.campaign_id]
          );

          try {
            const orgRes = await client.query(
              `select name, contact_email from organizations where id = $1`,
              [camp.organization_id]
            );
            const org = orgRes.rows[0] as Record<string, unknown> | undefined;
            if (org?.contact_email) {
              const { sendBrevoEmail } = await import("../services/brevo.js");
              const { emailLayout } = await import("../services/email-template.js");
              const content = `
                        <h2 style="color:#ffffff;margin:0 0 8px 0;font-size:22px;">Goal Reached!</h2>
                        <p style="color:#cccccc;margin:0 0 24px 0;font-size:16px;">Congratulations! <strong>${camp.title}</strong> has reached its fundraising goal.</p>
                        <div style="background:#1a1a1a;border:2px solid #059669;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
                          <span style="font-size:32px;font-weight:bold;color:#059669;">$${Number(camp.raised).toLocaleString()}</span>
                          <p style="color:#999999;margin:8px 0 0 0;font-size:14px;">raised of $${Number(camp.goal).toLocaleString()} goal</p>
                        </div>
                        <p style="color:#999999;font-size:14px;">The campaign has been automatically marked as completed. Thank you for making a difference!</p>
                      `;
              await sendBrevoEmail({
                to: org.contact_email as string,
                subject: `${camp.title} has reached its goal!`,
                html: emailLayout(content),
                tags: ["giveblack", "campaign-completed"],
              });
            }
          } catch (emailErr) {
            app.log.error({ err: emailErr }, "Failed to send campaign completion email");
          }

          broadcastChannel("campaign_updates", "campaign.completed", { campaignId: donation.campaign_id });
        }
      } else if (donation.org_id) {
        await incrementOrgTotalsFromDonation(client, donation.org_id, donation.amount);
      }

      await client.query(
        `with resolved as (
                   select coalesce(d.user_id, u.id) as uid,
                          d.amount,
                          d.created_at
                   from donations d
                   left join users u
                     on d.user_id is null
                    and u.role = 'donor'
                    and lower(trim(coalesce(u.email, ''))) = lower(trim(coalesce(d.donor_email, '')))
                   where d.stripe_payment_intent_id = $1
                     and d.status = 'succeeded'
                 )
                 insert into donor_stats (user_id, total_amount_cents, donation_count, first_donation_at, last_donation_at)
                 select uid,
                        (amount * 100)::bigint,
                        1,
                        created_at,
                        created_at
                 from resolved
                 where uid is not null
                 on conflict (user_id) do update set
                   total_amount_cents = donor_stats.total_amount_cents + excluded.total_amount_cents,
                   donation_count     = donor_stats.donation_count + 1,
                   first_donation_at  = least(donor_stats.first_donation_at, excluded.first_donation_at),
                   last_donation_at   = greatest(donor_stats.last_donation_at, excluded.last_donation_at)`,
        [pi.id]
      );

      broadcastChannel("donation_updates", "donation.succeeded", { paymentIntentId: pi.id });
    }
  }

  const finalizeCheckoutDonationSchema = z.object({
    sessionId: z.string().min(1),
  });

  /**
   * Browser callback after Stripe Checkout redirect (success URL includes `session_id`).
   * Marks the donation succeeded immediately so the admin UI is not stuck on "pending" when webhooks lag or fail.
   */
  app.post("/api/payments/finalize-checkout-donation", async (request, reply) => {
    let body: z.infer<typeof finalizeCheckoutDonationSchema>;
    try {
      body = finalizeCheckoutDonationSchema.parse(request.body);
    } catch {
      return reply.code(400).send({ error: "sessionId required" });
    }

    const stripe = requireStripe(reply);
    if (!stripe) return;

    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>>;
    try {
      session = await stripe.checkout.sessions.retrieve(body.sessionId);
    } catch {
      return reply.code(400).send({ error: "Invalid or expired checkout session" });
    }

    if (session.payment_status !== "paid") {
      return reply.code(400).send({
        error: "Payment not completed yet",
        paymentStatus: session.payment_status,
      });
    }

    const piId = stripeId(session.payment_intent as string | { id?: string } | null);
    if (!piId) {
      return reply.code(400).send({ error: "No payment intent for this session" });
    }

    let piObj: Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>>;
    try {
      piObj = await stripe.paymentIntents.retrieve(piId);
    } catch {
      return reply.code(400).send({ error: "Could not load payment intent" });
    }

    const md = (piObj.metadata || {}) as Record<string, string>;
    if (md.type === "wallet_topup") {
      return reply.code(400).send({ error: "Not a donation" });
    }

    // Some payment methods (or edge cases) can report Checkout `paid` while the PI is briefly `processing`.
    // Since we already verified the Checkout session is paid, proceed to apply the donation updates
    // (idempotent if already succeeded; webhooks may also apply later).

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `update donations set stripe_payment_intent_id = $1
         where stripe_payment_intent_id = $2 and status = 'pending'`,
        [piId, body.sessionId]
      );
      await applyDonationFromSucceededPaymentIntent(client, piObj as unknown as Record<string, unknown>);
      await client.query("COMMIT");
    } catch (e: unknown) {
      await client.query("ROLLBACK").catch(() => {});
      app.log.error({ err: e }, "finalize-checkout-donation");
      return reply.code(500).send({ error: e instanceof Error ? e.message : "Finalize failed" });
    } finally {
      client.release();
    }

    return { ok: true, paymentIntentId: piId, piStatus: (piObj as any)?.status };
  });

  /**
   * One-shot repair: pending rows whose Stripe Checkout session id (`cs_`) or PI id did not get webhook processing.
   * Safe to run repeatedly (idempotent when already succeeded).
   */
  app.post(
    "/api/admin/reconcile-pending-donations",
    { preHandler: [app.authenticate, app.requireRole("admin", "super_admin", "manager")] },
    async (request, reply) => {
      const stripe = requireStripe(reply);
      if (!stripe) return;

      const pendingRes = await db.query<{ id: string; stripe_payment_intent_id: string | null }>(
        `select id, stripe_payment_intent_id from donations
         where status = 'pending' and stripe_payment_intent_id is not null
         order by created_at desc
         limit 80`
      );

      let fixed = 0;
      const errors: string[] = [];

      for (const row of pendingRes.rows) {
        const key = String(row.stripe_payment_intent_id || "").trim();
        if (!key) continue;

        const client = await db.connect();
        try {
          await client.query("BEGIN");

          if (key.startsWith("cs_")) {
            const session = await stripe.checkout.sessions.retrieve(key);
            const piId = stripeId(session.payment_intent as string | { id?: string } | null);
            if (session.payment_status !== "paid" || !piId) {
              await client.query("ROLLBACK");
              continue;
            }
            const piObj = await stripe.paymentIntents.retrieve(piId);
            const md = (piObj.metadata || {}) as Record<string, string>;
            if (md.type === "wallet_topup") {
              await client.query("ROLLBACK");
              continue;
            }
            await client.query(
              `update donations set stripe_payment_intent_id = $1 where id = $2 and status = 'pending'`,
              [piId, row.id]
            );
            await applyDonationFromSucceededPaymentIntent(client, piObj as unknown as Record<string, unknown>);
          } else if (key.startsWith("pi_")) {
            const piObj = await stripe.paymentIntents.retrieve(key);
            const md = (piObj.metadata || {}) as Record<string, string>;
            if (md.type === "wallet_topup") {
              await client.query("ROLLBACK");
              continue;
            }
            if (piObj.status !== "succeeded") {
              await client.query("ROLLBACK");
              continue;
            }
            await applyDonationFromSucceededPaymentIntent(client, piObj as unknown as Record<string, unknown>);
          } else {
            await client.query("ROLLBACK");
            continue;
          }

          await client.query("COMMIT");
          fixed++;
        } catch (e: unknown) {
          await client.query("ROLLBACK").catch(() => {});
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${row.id}: ${msg}`);
        } finally {
          client.release();
        }
      }

      let repaired_hold = 0;
      const repairClient = await db.connect();
      try {
        await repairClient.query("BEGIN");
        repaired_hold = await repairSucceededDonationsLegacyHold(repairClient);
        await syncOrganizationRaisedFromSucceededDonations(repairClient);
        await repairClient.query("COMMIT");
      } catch (e: unknown) {
        await repairClient.query("ROLLBACK").catch(() => {});
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`post-reconcile repair: ${msg}`);
      } finally {
        repairClient.release();
      }

      return { ok: true, fixed, repaired_hold, checked: pendingRes.rows.length, errors };
    }
  );

  app.post(
    "/api/payments/sync-native-donation",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = syncNativeDonationSchema.parse(request.body);
      const user = request.user as { sub: string };
      const stripe = requireStripe(reply);
      if (!stripe) return;

      let pi: Awaited<ReturnType<ReturnType<typeof getStripe>["paymentIntents"]["retrieve"]>>;
      try {
        pi = await stripe.paymentIntents.retrieve(body.paymentIntentId);
      } catch {
        return reply.code(404).send({ error: "Payment not found" });
      }

      if (pi.status !== "succeeded") {
        return reply.code(400).send({ error: "Payment not completed yet" });
      }

      const md = (pi.metadata || {}) as Record<string, string>;
      if (md.type === "wallet_topup") {
        return reply.code(400).send({ error: "Not a donation" });
      }

      const own = await db.query(`select 1 from donations where stripe_payment_intent_id = $1 and user_id = $2`, [
        pi.id,
        user.sub,
      ]);
      if (!own.rowCount) {
        return reply.code(403).send({ error: "No matching donation for this account" });
      }

      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await applyDonationFromSucceededPaymentIntent(client, pi as unknown as Record<string, unknown>);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        app.log.error({ err }, "sync-native-donation failed");
        return reply.code(500).send({ error: "Failed to sync donation" });
      } finally {
        client.release();
      }

      void import("../services/user-push.js").then((m) =>
        m.notifyDonationFromPaymentIntent(body.paymentIntentId).catch((err) => {
          app.log.error({ err }, "notifyDonationFromPaymentIntent sync-native");
        })
      );

      return { ok: true };
    }
  );

  app.post("/api/payments/guest-donate-checkout", async (request, reply) => {
    let body: z.infer<typeof guestDonateCheckoutSchema>;
    try {
      body = guestDonateCheckoutSchema.parse(request.body);
    } catch (e: unknown) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : "Invalid request" });
    }

    const rateCheck = applyGuestRateLimit(normalizeEmail(body.email), request.ip);
    if (!rateCheck.allowed) {
      return reply.code(429).send({ error: rateCheck.reason ?? "Too many requests. Please try again later." });
    }

    const stripe = requireStripe(reply);
    if (!stripe) return;

    if (body.campaignId) {
      const campRes = await db.query(
        `select status, organization_id from campaigns where id = $1`,
        [body.campaignId]
      );
      const camp = campRes.rows[0] as { status: string; organization_id: string } | undefined;
      if (!camp) return reply.code(404).send({ error: "Campaign not found" });
      if (camp.organization_id !== body.orgId) return reply.code(400).send({ error: "Campaign does not belong to this organization" });
      if (camp.status !== "active") return reply.code(400).send({ error: "This campaign is not accepting donations" });
    }

    const orgRes = await db.query("select id, name from organizations where id = $1", [body.orgId]);
    if (!orgRes.rowCount) return reply.code(404).send({ error: "Organization not found" });
    const orgName = (orgRes.rows[0] as Record<string, unknown>)?.name as string || "Organization";

    let campaignTitle = "";
    if (body.campaignId) {
      const campRes = await db.query("select title from campaigns where id = $1", [body.campaignId]);
      campaignTitle = (campRes.rows[0] as Record<string, unknown> | undefined)?.title as string || "";
    }

    const description = campaignTitle
      ? `Donation to ${orgName} - ${campaignTitle}`
      : `Donation to ${orgName}`;

    const guestEmail = normalizeEmail(body.email);
    const guestName = body.name ? String(body.name).trim() : null;

    const existingCustomerRes = await db.query(
      "select stripe_customer_id from guest_stripe_customers where email = $1 limit 1",
      [guestEmail]
    );
    let customerId: string | null = (existingCustomerRes.rows[0] as { stripe_customer_id?: string } | undefined)?.stripe_customer_id ?? null;

    if (customerId) {
      try {
        const existingCustomer = await stripe.customers.retrieve(customerId);
        if ("deleted" in existingCustomer && existingCustomer.deleted) customerId = null;
      } catch {
        customerId = null;
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: guestEmail,
        name: guestName || undefined,
        metadata: { guest: "1" },
      });
      customerId = customer.id;
      await db.query(
        `insert into guest_stripe_customers (email, stripe_customer_id) values ($1, $2)
         on conflict (email) do update set stripe_customer_id = excluded.stripe_customer_id`,
        [guestEmail, customerId]
      );
    }

    const partnerId = await resolveEducationPartnerId(body.educationPartnerCode);
    const reinvestOptIn = body.reinvestOptIn ?? false;
    const reinvestPct = body.reinvestPct ?? 5;
    const alloc = computeReinvestAllocation(body.amount, reinvestOptIn, reinvestPct, partnerId);

    const baseUrl = env.EXPO_PUBLIC_API_URL
      ? env.EXPO_PUBLIC_API_URL.replace(/\/app\/?$/, "").replace(/\/$/, "")
      : `${request.protocol}://${request.hostname}`;

    const defaultGuestSuccess = `${baseUrl}/api/payments/guest-checkout-success?session_id={CHECKOUT_SESSION_ID}`;
    const ret = body.returnUrl?.trim();
    const successUrl = ret
      ? ret.includes("{CHECKOUT_SESSION_ID}")
        ? ret
        : ret.includes("?")
          ? `${ret}&session_id={CHECKOUT_SESSION_ID}`
          : `${ret}?session_id={CHECKOUT_SESSION_ID}`
      : defaultGuestSuccess;
    // Keep cancel separate from success so we can show a clear "return to app" fallback experience.
    const cancelUrl = `${baseUrl}/api/payments/checkout-cancel`;

    const donationMeta: Record<string, string> = {
      orgId: body.orgId,
      campaignId: body.campaignId || "",
      donorEmail: guestEmail,
      guest: "1",
      type: "donation",
      epId: partnerId || "",
      reinvest: reinvestOptIn ? "1" : "0",
      rAmt: String(alloc.reinvest_amount),
      pAmt: String(alloc.partner_reinvest_amount),
      gAmt: String(alloc.general_reinvest_amount),
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: body.currency,
            unit_amount: Math.round(body.amount * 100),
            product_data: { name: description },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: { metadata: donationMeta },
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: donationMeta,
    });

    const piIdAfterCreate = stripeId(session.payment_intent);
    const donationStripeKey = piIdAfterCreate ?? session.id;
    if (piIdAfterCreate) {
      await stripe.paymentIntents.update(piIdAfterCreate, {
        metadata: {
          ...Object.fromEntries(Object.entries(donationMeta).map(([k, v]) => [k, String(v ?? "")])),
          checkoutSessionId: session.id,
        },
      });
    }

    await db.query(
      `insert into donations (
         org_id, campaign_id, user_id, donor_email, donor_name, amount, currency, status, stripe_payment_intent_id,
         education_partner_id, reinvest_opt_in, reinvest_amount, partner_reinvest_amount, general_reinvest_amount
       ) values ($1, $2, NULL, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, $11, $12)`,
      [
        body.orgId,
        body.campaignId || null,
        guestEmail,
        guestName,
        body.amount,
        body.currency,
        donationStripeKey,
        partnerId || null,
        reinvestOptIn,
        alloc.reinvest_amount,
        alloc.partner_reinvest_amount,
        alloc.general_reinvest_amount,
      ]
    );

    return { url: session.url, sessionId: session.id };
  });

  app.post("/api/payments/guest-create-intent", async (request, reply) => {
    let body: z.infer<typeof guestCreateIntentSchema>;
    try {
      body = guestCreateIntentSchema.parse(request.body);
    } catch (e: unknown) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : "Invalid request" });
    }

    const rateCheck = applyGuestRateLimit(normalizeEmail(body.email), request.ip);
    if (!rateCheck.allowed) {
      return reply.code(429).send({ error: rateCheck.reason ?? "Too many requests. Please try again later." });
    }

    const stripe = requireStripe(reply);
    if (!stripe) return;

    if (body.campaignId) {
      const campRes = await db.query(
        `select status, organization_id from campaigns where id = $1`,
        [body.campaignId]
      );
      const camp = campRes.rows[0] as { status: string; organization_id: string } | undefined;
      if (!camp) return reply.code(404).send({ error: "Campaign not found" });
      if (camp.organization_id !== body.orgId) return reply.code(400).send({ error: "Campaign does not belong to this organization" });
      if (camp.status !== "active") return reply.code(400).send({ error: "This campaign is not accepting donations" });
    }

    const orgRes = await db.query("select id from organizations where id = $1", [body.orgId]);
    if (!orgRes.rowCount) return reply.code(404).send({ error: "Organization not found" });

    const guestEmail = normalizeEmail(body.email);
    const guestName = body.name ? String(body.name).trim() : null;

    const existingCustomerRes = await db.query(
      "select stripe_customer_id from guest_stripe_customers where email = $1 limit 1",
      [guestEmail]
    );
    let customerId: string | null = (existingCustomerRes.rows[0] as { stripe_customer_id?: string } | undefined)?.stripe_customer_id ?? null;

    if (customerId) {
      try {
        const existingCustomer = await stripe.customers.retrieve(customerId);
        if ("deleted" in existingCustomer && existingCustomer.deleted) customerId = null;
      } catch {
        customerId = null;
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: guestEmail,
        name: guestName || undefined,
        metadata: { guest: "1" },
      });
      customerId = customer.id;
      await db.query(
        `insert into guest_stripe_customers (email, stripe_customer_id) values ($1, $2)
         on conflict (email) do update set stripe_customer_id = excluded.stripe_customer_id`,
        [guestEmail, customerId]
      );
    }

    const partnerId = await resolveEducationPartnerId(body.educationPartnerCode);
    const reinvestOptIn = body.reinvestOptIn ?? false;
    const reinvestPct = body.reinvestPct ?? 5;
    const alloc = computeReinvestAllocation(body.amount, reinvestOptIn, reinvestPct, partnerId);

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(body.amount * 100),
      currency: body.currency,
      customer: customerId,
      payment_method_types: ["card"],
      metadata: {
        orgId: body.orgId,
        campaignId: body.campaignId || "",
        donorEmail: guestEmail,
        guest: "1",
        type: "donation",
        epId: partnerId || "",
        reinvest: reinvestOptIn ? "1" : "0",
        rAmt: String(alloc.reinvest_amount),
        pAmt: String(alloc.partner_reinvest_amount),
        gAmt: String(alloc.general_reinvest_amount),
      },
    } as any);

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2024-04-10" }
    );

    await db.query(
      `insert into donations (
         org_id, campaign_id, user_id, donor_email, donor_name, amount, currency, status, stripe_payment_intent_id,
         education_partner_id, reinvest_opt_in, reinvest_amount, partner_reinvest_amount, general_reinvest_amount
       ) values ($1, $2, NULL, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, $11, $12)`,
      [
        body.orgId,
        body.campaignId || null,
        guestEmail,
        guestName,
        body.amount,
        body.currency,
        intent.id,
        partnerId || null,
        reinvestOptIn,
        alloc.reinvest_amount,
        alloc.partner_reinvest_amount,
        alloc.general_reinvest_amount,
      ]
    );

    return {
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      customerId,
      ephemeralKey: ephemeralKey.secret,
    };
  });

  app.post("/api/payments/guest-sync-native-donation", async (request, reply) => {
    let body: z.infer<typeof guestSyncDonationSchema>;
    try {
      body = guestSyncDonationSchema.parse(request.body);
    } catch (e: unknown) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : "Invalid request" });
    }

    const rateCheck = applyGuestRateLimit(normalizeEmail(body.email), request.ip);
    if (!rateCheck.allowed) {
      return reply.code(429).send({ error: rateCheck.reason ?? "Too many requests. Please try again later." });
    }

    const stripe = requireStripe(reply);
    if (!stripe) return;

    let pi: Awaited<ReturnType<ReturnType<typeof getStripe>["paymentIntents"]["retrieve"]>>;
    try {
      pi = await stripe.paymentIntents.retrieve(body.paymentIntentId);
    } catch {
      return reply.code(404).send({ error: "Payment not found" });
    }

    if (pi.status !== "succeeded") {
      return reply.code(400).send({ error: "Payment not completed yet" });
    }

    const guestEmail = normalizeEmail(body.email);

    const donationCheck = await db.query(
      `select 1 from donations where stripe_payment_intent_id = $1 and lower(trim(coalesce(donor_email, ''))) = $2`,
      [pi.id, guestEmail]
    );
    if (!donationCheck.rowCount) {
      return reply.code(403).send({ error: "No matching donation for this email" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await applyDonationFromSucceededPaymentIntent(client, pi as unknown as Record<string, unknown>);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      app.log.error({ err }, "guest-sync-native-donation failed");
      return reply.code(500).send({ error: "Failed to sync donation" });
    } finally {
      client.release();
    }

    try {
      const donationInfoRes = await db.query(
        `select d.amount, o.name as org_name from donations d
         left join organizations o on o.id = d.org_id
         where d.stripe_payment_intent_id = $1 limit 1`,
        [pi.id]
      );
      const donInfo = donationInfoRes.rows[0] as { amount: string; org_name: string } | undefined;
      if (donInfo) {
        const { sendBrevoEmail } = await import("../services/brevo.js");
        const { emailLayout, ctaButton } = await import("../services/email-template.js");
        const amountStr = `$${Number(donInfo.amount).toFixed(2)}`;
        const content = `
          <h2 style="color:#ffffff;margin:0 0 8px 0;font-size:22px;">Thank You for Your Donation!</h2>
          <p style="color:#cccccc;margin:0 0 24px 0;font-size:16px;">Your donation of <strong style="color:#059669;">${amountStr}</strong> to <strong>${donInfo.org_name}</strong> has been received.</p>
          <div style="background:#1a1a1a;border:1px solid #222222;border-radius:12px;padding:24px;margin-bottom:24px;">
            <p style="color:#999999;margin:0 0 8px 0;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Donation Summary</p>
            <p style="color:#ffffff;margin:0 0 4px 0;font-size:16px;"><strong>Organization:</strong> ${donInfo.org_name}</p>
            <p style="color:#ffffff;margin:0;font-size:16px;"><strong>Amount:</strong> ${amountStr}</p>
          </div>
          <p style="color:#cccccc;margin:0 0 24px 0;font-size:15px;">Want to track your donations and access exclusive donor features? Create a free GiveBlack account.</p>
          ${ctaButton("https://giveblackapp.com", "Create Free Account")}
          <p style="color:#999999;margin:24px 0 0 0;font-size:13px;">Thank you for making a difference in your community.</p>
        `;
        await sendBrevoEmail({
          to: guestEmail,
          subject: `Your donation to ${donInfo.org_name} - Receipt`,
          html: emailLayout(content),
          tags: ["giveblack", "donation-receipt", "guest"],
        });
      }
    } catch (emailErr) {
      app.log.error({ err: emailErr }, "Failed to send guest donation receipt email");
    }

    return { ok: true };
  });

  app.post("/api/webhooks/stripe", async (request, reply) => {
    const rawBody = request.rawBody as string | undefined;
    if (!rawBody) {
      return reply.code(400).send({ error: "Missing raw body" });
    }

    const signature = request.headers["stripe-signature"] as string | undefined;
    const event = verifyStripeWebhook(rawBody, signature);

    const checkResult = await db.query(
      `select 1 from webhook_events where provider = 'stripe' and event_id = $1`,
      [event.id]
    );
    if (checkResult.rowCount && checkResult.rowCount > 0) {
      return { received: true };
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      switch (event.type) {
        case "payment_intent.succeeded": {
          const pi = event.data.object as unknown as Record<string, unknown>;
          const metadata = (pi.metadata || {}) as Record<string, string>;

          if (metadata.type === "wallet_topup") {
            const amountUsd = Number(pi.amount ?? 0) / 100;
            await client.query(
              `insert into transactions (user_id, amount, type, description) values ($1, $2, 'topup', 'Wallet top-up via Stripe')`,
              [metadata.userId, amountUsd]
            );
            broadcastChannel("wallet_updates", "wallet.topup", { userId: metadata.userId, amount: amountUsd });
          } else {
            await applyDonationFromSucceededPaymentIntent(client, pi);
          }
          break;
        }

        case "payment_intent.payment_failed": {
          const pi = event.data.object as unknown as Record<string, unknown>;
          await client.query(
            "update donations set status = 'failed' where stripe_payment_intent_id = $1",
            [pi.id]
          );
          break;
        }

        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          const session = event.data.object as unknown as Record<string, unknown>;
          const sessionPaymentIntent = stripeId(session.payment_intent as string | { id?: string } | null);
          const sessionId = session.id as string;
          if (sessionPaymentIntent && session.mode === "payment") {
            const updateRes = await client.query(
              `update donations set stripe_payment_intent_id = $1
               where stripe_payment_intent_id = $2`,
              [sessionPaymentIntent, sessionId]
            );
            if (updateRes.rowCount === 0) {
              const md = (session.metadata || {}) as Record<string, string>;
              if (md.orgId) {
                const epId = md.epId && md.epId.length > 0 ? md.epId : null;
                const reinvestOptIn = md.reinvest === "1";
                const rAmt = Number.parseFloat(md.rAmt || "0") || 0;
                const pAmt = Number.parseFloat(md.pAmt || "0") || 0;
                const gAmt = Number.parseFloat(md.gAmt || "0") || 0;
                const donorUserId = md.donorUserId && md.donorUserId.length > 0 ? md.donorUserId : null;
                let whDonorEmail: string | null = null;
                let whDonorName: string | null = null;
                if (donorUserId) {
                  const unr = await client.query(
                    `select lower(trim(coalesce(email, ''))) as e, nullif(trim(full_name), '') as full_name
                     from users where id = $1`,
                    [donorUserId]
                  );
                  const ur = unr.rows[0] as { e?: string; full_name?: string } | undefined;
                  whDonorEmail = String(ur?.e || "").trim() || null;
                  whDonorName = String(ur?.full_name || "").trim() || null;
                }
                await client.query(
                  `insert into donations (
                     org_id, campaign_id, user_id, donor_email, donor_name, amount, currency, status, stripe_payment_intent_id,
                     education_partner_id, reinvest_opt_in, reinvest_amount, partner_reinvest_amount, general_reinvest_amount
                   ) values ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11, $12, $13)
                   on conflict (stripe_payment_intent_id) do nothing`,
                  [
                    md.orgId,
                    md.campaignId || null,
                    donorUserId,
                    whDonorEmail,
                    whDonorName,
                    Number(session.amount_total ?? 0) / 100,
                    "usd",
                    sessionPaymentIntent,
                    epId,
                    reinvestOptIn,
                    rAmt,
                    pAmt,
                    gAmt,
                  ]
                );
              }
            }
            if (session.payment_status === "paid") {
              const grossCents =
                typeof session.amount_total === "number" ? session.amount_total : Number(session.amount_total ?? 0);
              const checkoutDonationRes = await markDonationSucceededWithPayout(
                client,
                sessionPaymentIntent,
                grossCents
              );
              if (checkoutDonationRes.rowCount && checkoutDonationRes.rowCount > 0) {
                const cDon = checkoutDonationRes.rows[0] as {
                  campaign_id: string | null;
                  amount: string;
                  org_id: string | null;
                };
                if (cDon.campaign_id) {
                  await client.query(
                    `update campaigns set raised = raised + $1, donor_count = donor_count + 1, updated_at = now() where id = $2`,
                    [cDon.amount, cDon.campaign_id]
                  );
                  const cRes = await client.query(
                    `select id, title, raised, goal, status, organization_id from campaigns where id = $1`,
                    [cDon.campaign_id]
                  );
                  const cCamp = cRes.rows[0] as Record<string, unknown> | undefined;

                  if (cCamp?.organization_id) {
                    await incrementOrgTotalsFromDonation(client, cCamp.organization_id as string, cDon.amount);
                  }

                  if (cCamp && cCamp.status === "active" && Number(cCamp.raised) >= Number(cCamp.goal) && Number(cCamp.goal) > 0) {
                    await client.query(
                      `update campaigns set status = 'completed', updated_at = now() where id = $1`,
                      [cDon.campaign_id]
                    );
                    try {
                      const orgRes = await client.query(
                        `select name, contact_email from organizations where id = $1`,
                        [cCamp.organization_id]
                      );
                      const org = orgRes.rows[0] as Record<string, unknown> | undefined;
                      if (org?.contact_email) {
                        const { sendBrevoEmail } = await import("../services/brevo.js");
                        const { emailLayout } = await import("../services/email-template.js");
                        const content = `
                          <h2 style="color:#ffffff;margin:0 0 8px 0;font-size:22px;">Goal Reached!</h2>
                          <p style="color:#cccccc;margin:0 0 24px 0;font-size:16px;">Congratulations! <strong>${cCamp.title}</strong> has reached its fundraising goal.</p>
                          <div style="background:#1a1a1a;border:2px solid #059669;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
                            <span style="font-size:32px;font-weight:bold;color:#059669;">$${Number(cCamp.raised).toLocaleString()}</span>
                            <p style="color:#999999;margin:8px 0 0 0;font-size:14px;">raised of $${Number(cCamp.goal).toLocaleString()} goal</p>
                          </div>
                          <p style="color:#999999;font-size:14px;">The campaign has been automatically marked as completed. Thank you for making a difference!</p>
                        `;
                        await sendBrevoEmail({
                          to: org.contact_email as string,
                          subject: `${cCamp.title} has reached its goal!`,
                          html: emailLayout(content),
                          tags: ["giveblack", "campaign-completed"],
                        });
                      }
                    } catch (emailErr) {
                      app.log.error({ err: emailErr }, "Failed to send campaign completion email");
                    }
                    broadcastChannel("campaign_updates", "campaign.completed", { campaignId: cDon.campaign_id });
                  }
                } else if (cDon.org_id) {
                  await incrementOrgTotalsFromDonation(client, cDon.org_id, cDon.amount);
                }
              }
            }
          }
          if (session.mode === "subscription" && env.STRIPE_SECRET_KEY) {
            const rawSub = session.subscription;
            const sid =
              typeof rawSub === "string"
                ? rawSub
                : rawSub && typeof rawSub === "object" && rawSub !== null && "id" in rawSub
                  ? String((rawSub as { id: string }).id)
                  : "";
            if (sid) {
              try {
                const stripe = getStripe();
                const stripeSub = await stripe.subscriptions.retrieve(sid, {
                  expand: ["latest_invoice.payment_intent"],
                });
                const subRecord = stripeSub as unknown as Record<string, unknown>;
                applySubscriptionPaidHeuristic(subRecord);
                await upsertOrgSubscriptionFromStripe(subRecord);
              } catch (err) {
                app.log.error({ err }, "checkout.session.completed: subscription sync failed");
              }
            }
          }
          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const sub = event.data.object as unknown as Record<string, unknown>;
          const metadata = (sub.metadata || {}) as Record<string, string>;
          const orgId = metadata.org_id;
          if (!orgId || !env.STRIPE_SECRET_KEY) break;

          try {
            const stripe = getStripe();
            const subscriptionId = String(sub.id || "");
            if (!subscriptionId) break;
            const fullSub = await stripe.subscriptions.retrieve(subscriptionId, {
              expand: ["latest_invoice.payment_intent"],
            });
            const subRecord = fullSub as unknown as Record<string, unknown>;
            await upsertOrgSubscriptionFromStripe(subRecord, orgId);
          } catch (err) {
            app.log.error({ err, orgId }, "customer.subscription.*: sync failed");
          }
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as unknown as Record<string, unknown>;
          const subscriptionId = sub.id as string;
          // Do not auto-expire admin entitlements based on Stripe lifecycle events.
          // (manual removals are already handled via canceled_at)
          await client.query(`update org_subscriptions set updated_at = now() where stripe_subscription_id = $1`, [subscriptionId]);
          break;
        }

        case "invoice.paid": {
          const invoice = event.data.object as unknown as Record<string, unknown>;
          const subscriptionId = invoice.subscription as string | null;
          // Persist subscription revenue for admin dashboards.
          // (We keep entitlements admin-controlled; this is purely for reporting.)
          try {
            const invId = String(invoice.id || "").trim();
            const paid = Number((invoice as any).amount_paid ?? (invoice as any).total ?? 0);
            const currency = String((invoice as any).currency || "usd").toLowerCase();
            const paidAtUnix = Number((invoice as any).status_transitions?.paid_at ?? 0);
            const paidAt = paidAtUnix ? new Date(paidAtUnix * 1000).toISOString() : null;
            const custId = String((invoice as any).customer || "").trim() || null;

            if (invId && subscriptionId) {
              // Resolve org_id from subscription metadata.
              let orgId: string | null = null;
              if (env.STRIPE_SECRET_KEY) {
                try {
                  const stripe = getStripe();
                  const sub = await stripe.subscriptions.retrieve(subscriptionId);
                  const meta = ((sub as any)?.metadata || {}) as Record<string, string>;
                  const mOrg = String(meta.org_id || "").trim();
                  if (mOrg) orgId = mOrg;
                } catch {
                  // best-effort
                }
              }

              await client.query(
                `insert into subscription_payments
                   (stripe_invoice_id, org_id, stripe_subscription_id, stripe_customer_id, currency, amount, paid_at)
                 values ($1, $2, $3, $4, $5, $6, $7)
                 on conflict (stripe_invoice_id) do nothing`,
                [invId, orgId, subscriptionId, custId, currency || "usd", (paid || 0) / 100, paidAt]
              );
            }
          } catch {
            // ignore reporting failures
          }
          if (subscriptionId && env.STRIPE_SECRET_KEY) {
            try {
              const stripe = getStripe();
              const stripeSub = await stripe.subscriptions.retrieve(subscriptionId, {
                expand: ["latest_invoice.payment_intent"],
              });
              const subRecord = stripeSub as unknown as Record<string, unknown>;
              applySubscriptionPaidHeuristic(subRecord);
              await upsertOrgSubscriptionFromStripe(subRecord);
            } catch (err) {
              app.log.error({ err, subscriptionId }, "invoice.paid: subscription sync failed");
              await client.query(`update org_subscriptions set updated_at = now() where stripe_subscription_id = $1`, [
                subscriptionId,
              ]);
            }
          } else if (subscriptionId) {
            await client.query(`update org_subscriptions set updated_at = now() where stripe_subscription_id = $1`, [
              subscriptionId,
            ]);
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as unknown as Record<string, unknown>;
          const subscriptionId = invoice.subscription as string | null;
          if (subscriptionId) {
            // Preserve admin-controlled tier/status; only update timestamps from failed payments.
            await client.query(`update org_subscriptions set updated_at = now() where stripe_subscription_id = $1`, [subscriptionId]);
          }
          break;
        }

        case "account.updated": {
          const account = event.data.object as unknown as Record<string, unknown>;
          const accountId = account.id as string;
          const payoutsEnabled = Boolean(account.payouts_enabled);
          await client.query(
            `update organizations set payouts_enabled = $1 where stripe_account_id = $2`,
            [payoutsEnabled, accountId]
          );
          break;
        }
      }

      await client.query(
        `insert into webhook_events (provider, event_id, type, payload)
         values ('stripe', $1, $2, $3::jsonb)
         on conflict (provider, event_id) do nothing`,
        [event.id, event.type, JSON.stringify(event)]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as unknown as Record<string, unknown>;
      const metadata = (pi.metadata || {}) as Record<string, string>;
      if (metadata.type !== "wallet_topup") {
        const piId = String(pi.id || "");
        if (piId) {
          void import("../services/user-push.js").then((m) =>
            m.notifyDonationFromPaymentIntent(piId).catch((err) => {
              app.log.error({ err }, "notifyDonationFromPaymentIntent webhook");
            })
          );
        }
      }
    }

    return { received: true };
  });
};

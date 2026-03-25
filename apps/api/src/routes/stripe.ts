import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { env } from "../config/env.js";
import { getStripe, verifyStripeWebhook } from "../services/stripe.js";
import { broadcastChannel } from "../realtime/hub.js";

export const TIER_LIMITS: Record<string, { max_community_campaigns: number; max_goal_per_campaign: number }> = {
  free: { max_community_campaigns: 1, max_goal_per_campaign: 5000 },
  growth: { max_community_campaigns: 5, max_goal_per_campaign: 50000 },
  institutional: { max_community_campaigns: 999999, max_goal_per_campaign: 999999999 },
};

function tierFromProductId(productId: string | null | undefined): string {
  if (!productId) return "free";
  if (productId === env.STRIPE_PRODUCT_GROWTH) return "growth";
  if (productId === env.STRIPE_PRODUCT_INSTITUTIONAL) return "institutional";
  return "free";
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

function tierForSubscriptionStatus(status: string, paidTier: string): string {
  // Only grant paid features once Stripe confirms the subscription is active/trialing.
  // For lifecycle states like "incomplete" (payment method not confirmed yet), keep the tier as free.
  if (status === "active" || status === "trialing") return paidTier;
  return "free";
}

const createIntentSchema = z.object({
  orgId: z.string().min(1),
  campaignId: z.string().optional(),
  // Coerce from string to number so mobile/web JSON bodies are forgiving
  amount: z.coerce.number().positive(),
  currency: z.string().default("usd"),
});

const donationCheckoutSchema = z.object({
  orgId: z.string().min(1),
  campaignId: z.string().optional(),
  amount: z.coerce.number().positive(),
  currency: z.string().default("usd"),
  // Optional return URL for mobile deep link back into the app after web checkout
  returnUrl: z.string().min(1).optional(),
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

  async function upsertOrgSubscriptionFromStripe(
    subscription: Record<string, unknown>,
    fallbackOrgId?: string
  ): Promise<{ orgId: string; tier: string; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; subscriptionId: string }> {
    const metadata = (subscription.metadata || {}) as Record<string, string>;
    const orgId = metadata.org_id || fallbackOrgId;
    if (!orgId) throw new Error("Missing organization id for subscription");

    const items = subscription.items as { data?: Array<{ price?: { product?: string } }> } | undefined;
    const productId = items?.data?.[0]?.price?.product as string | undefined;
    const resolvedTier = metadata.tier || tierFromProductId(productId);
    const status = String(subscription.status || "incomplete");
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

    await db.query(
      `insert into org_subscriptions (org_id, tier, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end, canceled_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       on conflict (stripe_subscription_id) do update set
         tier = excluded.tier,
         status = excluded.status,
         stripe_customer_id = excluded.stripe_customer_id,
         current_period_start = excluded.current_period_start,
         current_period_end = excluded.current_period_end,
         cancel_at_period_end = excluded.cancel_at_period_end,
         canceled_at = excluded.canceled_at,
         updated_at = now()`,
      [orgId, effectiveTier, status, customerId || null, subscriptionId, periodStart, periodEnd, cancelAtPeriodEnd, canceledAt]
    );

    return {
      orgId,
      tier: effectiveTier,
      status,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd,
      subscriptionId,
    };
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

      const orgRes = await db.query(
        "select stripe_account_id from organizations where id = $1",
        [body.orgId]
      );
      const orgStripeAccount = (orgRes.rows[0] as Record<string, unknown> | undefined)?.stripe_account_id as string | null;

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
        },
      };

      if (orgStripeAccount) {
        const platformFee = Math.round(body.amount * 100 * 0.029 + 30);
        intentParams.application_fee_amount = platformFee;
        intentParams.transfer_data = { destination: orgStripeAccount };
      }

      const intent = await stripe.paymentIntents.create(intentParams as any);

      const ephemeralKey = await stripe.ephemeralKeys.create(
        { customer: customerId },
        { apiVersion: "2024-04-10" }
      );

      await db.query(
        `insert into donations (org_id, campaign_id, user_id, amount, currency, status, stripe_payment_intent_id)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [body.orgId, body.campaignId || null, user.sub, body.amount, body.currency, "pending", intent.id]
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

      const cancelBase = body.returnUrl && body.returnUrl.trim().length > 0
        ? body.returnUrl.trim()
        : `${baseUrl}/api/payments/checkout-cancel`;

      const cancelUrl = cancelBase.includes("?")
        ? `${cancelBase}&cancelled=1`
        : `${cancelBase}?cancelled=1`;

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
          metadata: {
            orgId: body.orgId,
            campaignId: body.campaignId || "",
            donorUserId: user.sub,
            type: "donation",
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          orgId: body.orgId,
          campaignId: body.campaignId || "",
          donorUserId: user.sub,
        },
      });

      await db.query(
        `insert into donations (org_id, campaign_id, user_id, amount, currency, status, stripe_payment_intent_id)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [body.orgId, body.campaignId || null, user.sub, body.amount, body.currency, "pending", session.id]
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
      const paymentIntentId = session.payment_intent as string | null;
      let donation: { status: string; amount: number; currency: string; org_id: string | null; campaign_id: string | null } | null = null;

      if (paymentIntentId) {
        const donRes = await db.query(
          `select org_id, campaign_id, amount, currency, status
           from donations
           where stripe_payment_intent_id = $1
           limit 1`,
          [paymentIntentId]
        );
        if (donRes.rowCount && donRes.rows[0]) {
          const row = donRes.rows[0] as any;
          donation = {
            status: row.status,
            amount: Number(row.amount),
            currency: row.currency,
            org_id: row.org_id,
            campaign_id: row.campaign_id,
          };
        }
      }

      return {
        sessionId,
        paymentStatus: session.payment_status,
        amountTotal: typeof session.amount_total === "number" ? session.amount_total / 100 : null,
        currency: (session.currency as string | undefined) || donation?.currency || "usd",
        donation,
      };
    } catch (e: any) {
      request.log.error({ err: e }, "Failed to fetch checkout session status");
      return reply.code(400).send({ error: "Invalid or expired session" });
    }
  });

  app.get("/api/payments/checkout-success", async (request, reply) => {
    return reply.type("text/html").send(`
      <!DOCTYPE html>
      <html><head><title>Payment Successful</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fff; }
        .card { text-align: center; padding: 40px; }
        .icon { font-size: 64px; margin-bottom: 16px; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        p { color: #999; font-size: 16px; margin-bottom: 24px; }
        .btn { background: #059669; color: #fff; border: none; padding: 14px 32px; border-radius: 12px; font-size: 16px; cursor: pointer; text-decoration: none; display: inline-block; }
      </style>
      </head><body>
        <div class="card">
          <div class="icon">&#10003;</div>
          <h1>Payment Successful</h1>
          <p>Thank you for your donation! You can close this window and return to the app.</p>
        </div>
      </body></html>
    `);
  });

  app.get("/api/payments/checkout-cancel", async (request, reply) => {
    return reply.type("text/html").send(`
      <!DOCTYPE html>
      <html><head><title>Payment Cancelled</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fff; }
        .card { text-align: center; padding: 40px; }
        .icon { font-size: 64px; margin-bottom: 16px; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        p { color: #999; font-size: 16px; margin-bottom: 24px; }
      </style>
      </head><body>
        <div class="card">
          <div class="icon">&#10007;</div>
          <h1>Payment Cancelled</h1>
          <p>Your donation was not processed. You can close this window and return to the app.</p>
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
    const userRes = await db.query("select email from users where id = $1", [user.sub]);
    const userEmail = ((userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined) || "";
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
         d.user_id = $1
         or (
           d.user_id is null
           and lower(coalesce(d.donor_email, '')) = lower($2)
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
       where t.user_id = $1

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

    const invoice = stripeSubscription.latest_invoice as Record<string, unknown> | undefined;
    const paymentIntent = (invoice?.payment_intent ?? null) as Record<string, unknown> | null;
    const clientSecret = (paymentIntent?.client_secret as string | undefined) || null;
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
    if (!subscriptionId) return reply.code(400).send({ error: "No subscription found for this organization" });

    const stripeSub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice.payment_intent"],
    });

    // If the latest invoice payment_intent has succeeded but Stripe hasn't fired the
    // subscription.updated webhook yet, the status will still be "incomplete".
    // Treat it as "active" for tier resolution so the user sees their paid plan immediately.
    const subAsRecord = stripeSub as unknown as Record<string, unknown>;
    const latestInvoice = subAsRecord.latest_invoice as Record<string, unknown> | undefined;
    const paymentIntent = latestInvoice?.payment_intent as Record<string, unknown> | undefined;
    const paymentIntentStatus = paymentIntent?.status as string | undefined;
    const isPaymentConfirmed = paymentIntentStatus === "succeeded" || paymentIntentStatus === "processing";

    if (isPaymentConfirmed && String(subAsRecord.status || "") === "incomplete") {
      // Payment confirmed on native side; treat subscription as active for tier purposes.
      subAsRecord.status = "active";
    }

    const saved = await upsertOrgSubscriptionFromStripe(subAsRecord, body.org_id);
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
        community_campaign_count: 0,
      };
    }

    const subRes = await db.query(
      "select * from org_subscriptions where org_id = $1 order by updated_at desc nulls last, created_at desc limit 1",
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

    return {
      org_id: orgId,
      subscription: {
        tier,
        status: (sub?.status as string) || "active",
        current_period_end: sub?.current_period_end || null,
        cancel_at_period_end: sub?.cancel_at_period_end || false,
        limits,
      },
      community_campaign_count: campaignCount,
    };
  });

  app.get("/api/subscriptions/org/:orgId/features", async (request, reply) => {
    const { orgId } = request.params as { orgId: string };

    const subRes = await db.query(
      "select tier, status from org_subscriptions where org_id = $1 and status = 'active' order by updated_at desc nulls last, created_at desc limit 1",
      [orgId]
    );
    const sub = subRes.rows[0] as Record<string, unknown> | undefined;
    const tier = (sub?.tier as string) || "free";
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;

    const featureList: string[] = [];
    if (tier === "free") {
      featureList.push("1 community campaign", "Up to $5,000 goal per campaign", "Standard support");
    } else if (tier === "growth") {
      featureList.push("5 community campaigns", "Up to $50,000 goal per campaign", "Volunteer signup", "Everything in Free", "Priority support");
    } else if (tier === "institutional") {
      featureList.push("Unlimited community campaigns", "Unlimited goal per campaign", "Volunteer signup", "Everything in Growth", "Dedicated support");
    }

    return {
      tier,
      status: (sub?.status as string) || "active",
      features: featureList,
      limits,
    };
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
            const donationRes = await client.query(
              `update donations set status = 'succeeded', paid_at = now()
               where stripe_payment_intent_id = $1 and status != 'succeeded'
               returning campaign_id, amount`,
              [pi.id]
            );

            if (donationRes.rowCount && donationRes.rowCount > 0) {
              const donation = donationRes.rows[0] as { campaign_id: string | null; amount: string };
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

                // Keep organization totals in sync with campaign donations.
                if (camp?.organization_id) {
                  await client.query(
                    `update organizations set raised = raised + $1 where id = $2`,
                    [donation.amount, camp.organization_id]
                  );
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
              }
            }

            // Update donor_stats aggregate for rankings and totals
            await client.query(
              `insert into donor_stats (user_id, total_amount_cents, donation_count, first_donation_at, last_donation_at)
               select d.user_id,
                      (d.amount * 100)::bigint,
                      1,
                      d.created_at,
                      d.created_at
               from donations d
               where d.stripe_payment_intent_id = $1
                 and d.status = 'succeeded'
                 and d.user_id is not null
              on conflict (user_id) do update set
                total_amount_cents = donor_stats.total_amount_cents + EXCLUDED.total_amount_cents,
                donation_count     = donor_stats.donation_count + 1,
                first_donation_at  = least(donor_stats.first_donation_at, EXCLUDED.first_donation_at),
                last_donation_at   = greatest(donor_stats.last_donation_at, EXCLUDED.last_donation_at)`,
              [pi.id]
            );

            broadcastChannel("donation_updates", "donation.succeeded", { paymentIntentId: pi.id });
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

        case "checkout.session.completed": {
          const session = event.data.object as unknown as Record<string, unknown>;
          const sessionPaymentIntent = session.payment_intent as string | null;
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
                await client.query(
                  `insert into donations (org_id, campaign_id, amount, currency, status, stripe_payment_intent_id)
                   values ($1, $2, $3, $4, 'pending', $5)
                   on conflict (stripe_payment_intent_id) do nothing`,
                  [md.orgId, md.campaignId || null, Number(session.amount_total ?? 0) / 100, "usd", sessionPaymentIntent]
                );
              }
            }
            if (session.payment_status === "paid") {
              const checkoutDonationRes = await client.query(
                `update donations set status = 'succeeded', paid_at = now()
                 where stripe_payment_intent_id = $1 and status != 'succeeded'
                 returning campaign_id, amount`,
                [sessionPaymentIntent]
              );
              if (checkoutDonationRes.rowCount && checkoutDonationRes.rowCount > 0) {
                const cDon = checkoutDonationRes.rows[0] as { campaign_id: string | null; amount: string };
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

                  // Keep organization totals in sync with campaign donations.
                  if (cCamp?.organization_id) {
                    await client.query(
                      `update organizations set raised = raised + $1 where id = $2`,
                      [cDon.amount, cCamp.organization_id]
                    );
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
                }
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
          if (!orgId) break;

          const items = sub.items as { data?: Array<{ price?: { product?: string } }> } | undefined;
          const productId = items?.data?.[0]?.price?.product as string | undefined;
          const resolvedTier = metadata.tier || tierFromProductId(productId);
          const customerId = sub.customer as string;
          const subscriptionId = sub.id as string;
          const status = sub.status as string;
          const tier = tierForSubscriptionStatus(status, resolvedTier);
          const periodStart = sub.current_period_start ? new Date((sub.current_period_start as number) * 1000).toISOString() : null;
          const periodEnd = sub.current_period_end ? new Date((sub.current_period_end as number) * 1000).toISOString() : null;
          const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
          const canceledAt = sub.canceled_at ? new Date((sub.canceled_at as number) * 1000).toISOString() : null;

          await client.query(
            `insert into org_subscriptions (org_id, tier, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end, canceled_at, updated_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
             on conflict (stripe_subscription_id) do update set
               tier = excluded.tier,
               status = excluded.status,
               stripe_customer_id = excluded.stripe_customer_id,
               current_period_start = excluded.current_period_start,
               current_period_end = excluded.current_period_end,
               cancel_at_period_end = excluded.cancel_at_period_end,
               canceled_at = excluded.canceled_at,
               updated_at = now()`,
            [orgId, tier, status, customerId, subscriptionId, periodStart, periodEnd, cancelAtPeriodEnd, canceledAt]
          );
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as unknown as Record<string, unknown>;
          const subscriptionId = sub.id as string;
          await client.query(
            `update org_subscriptions set status = 'canceled', tier = 'free', canceled_at = now(), updated_at = now() where stripe_subscription_id = $1`,
            [subscriptionId]
          );
          break;
        }

        case "invoice.paid": {
          const invoice = event.data.object as unknown as Record<string, unknown>;
          const subscriptionId = invoice.subscription as string | null;
          if (subscriptionId) {
            await client.query(
              `update org_subscriptions set status = 'active', updated_at = now() where stripe_subscription_id = $1`,
              [subscriptionId]
            );
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as unknown as Record<string, unknown>;
          const subscriptionId = invoice.subscription as string | null;
          if (subscriptionId) {
            await client.query(
              `update org_subscriptions set status = 'past_due', tier = 'free', updated_at = now() where stripe_subscription_id = $1`,
              [subscriptionId]
            );
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

    return { received: true };
  });
};

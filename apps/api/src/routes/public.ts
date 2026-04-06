import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { env } from "../config/env.js";
import { getStripe } from "../services/stripe.js";
import { stripeId } from "../lib/stripe-ids.js";

const publicDonateSchema = z.object({
  campaignId: z.string().min(1),
  orgId: z.string().min(1),
  amount: z.number().positive(),
  donorName: z.string().optional().default("Anonymous"),
  donorEmail: z.string().email(),
  message: z.string().optional().default(""),
  isAnonymous: z.boolean().optional().default(false),
  currency: z.string().optional().default("usd"),
});

export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/organizations", async (_, reply) => {
    try {
      const result = await db.query(
        `select id, name, description, raised, goal, donor_count, image_url, category_id
         from organizations
         where archived_at is null
         order by featured desc nulls last, created_at desc
         limit 200`
      );
      return result.rows;
    } catch (e: unknown) {
      app.log.error(e);
      return reply.code(500).send({ error: "Failed to fetch organizations" });
    }
  });

  app.get("/api/categories", async (_, reply) => {
    try {
      const result = await db.query(
        `select id, name, icon, color
         from categories
         order by name asc`
      );
      return { categories: result.rows };
    } catch (e: unknown) {
      app.log.error(e);
      return reply.code(500).send({ error: "Failed to fetch categories" });
    }
  });

  app.get("/api/campaigns", async (request, reply) => {
    try {
      const q = request.query as Record<string, string>;
      const values: unknown[] = [];
      const where: string[] = ["c.status = 'active'", "o.archived_at is null"];
      if (q.category_id) {
        values.push(q.category_id);
        where.push(`o.category_id = $${values.length}`);
      }
      const w = where.join(" and ");
      const result = await db.query(
        `select c.id, c.title, c.description, c.story, c.about, c.main_image_url,
                c.location, c.goal,
                coalesce(cd.raised, 0) as raised,
                coalesce(cd.donor_count, 0)::int as donor_count,
                c.status,
                c.organization_id, c.created_at,
                o.name as org_name, o.image_url as org_image_url,
                o.initials as org_initials, o.image_color as org_image_color,
                o.category_id, o.verified as org_verified,
                cat.name as category_name
         from campaigns c
         join organizations o on o.id = c.organization_id
         left join categories cat on cat.id = o.category_id
         left join lateral (
           select coalesce(sum(d.amount), 0)::numeric as raised,
                  count(*)::int as donor_count
           from donations d
           where d.campaign_id = c.id and d.status = 'succeeded'
         ) cd on true
         where ${w}
         order by c.created_at desc
         limit 200`,
        values
      );
      return result.rows;
    } catch (e: unknown) {
      app.log.error(e);
      return reply.code(500).send({ error: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const campResult = await db.query(
        `select c.id, c.title, c.description, c.story, c.about, c.main_image_url,
                c.location, c.goal,
                coalesce(cd.raised, 0) as raised,
                coalesce(cd.donor_count, 0)::int as donor_count,
                c.status,
                c.organization_id, c.created_at,
                o.name as org_name, o.image_url as org_image_url,
                o.initials as org_initials, o.image_color as org_image_color,
                o.category_id, o.verified as org_verified, o.description as org_description,
                coalesce(s.tier, 'free') as org_tier
         from campaigns c
         join organizations o on o.id = c.organization_id
         left join lateral (
           select coalesce(sum(d.amount), 0)::numeric as raised,
                  count(*)::int as donor_count
           from donations d
           where d.campaign_id = c.id and d.status = 'succeeded'
         ) cd on true
         left join lateral (
           select tier from org_subscriptions
           where org_id = o.id and status = 'active'
           order by created_at desc limit 1
         ) s on true
         where c.id = $1
         limit 1`,
        [id]
      );
      if (!campResult.rowCount) return reply.code(404).send({ error: "Campaign not found" });

      const campaign = campResult.rows[0];

      const imgResult = await db.query(
        `select id, image_url, caption, sort_order
         from campaign_images
         where campaign_id = $1
         order by sort_order asc`,
        [id]
      );
      campaign.gallery = imgResult.rows;

      return campaign;
    } catch (e: unknown) {
      app.log.error(e);
      return reply.code(500).send({ error: "Failed to fetch campaign" });
    }
  });

  app.get("/api/organizations/search", async (request, reply) => {
    const query = (request.query as Record<string, unknown>)?.q;
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return [];
    }
    try {
      const result = await db.query(
        `select id, name, description, raised, goal, donor_count, image_url, category_id
         from organizations
         where archived_at is null
           and (name ilike $1 or description ilike $1)
         order by featured desc nulls last, created_at desc
         limit 50`,
        [`%${query.trim()}%`]
      );
      return result.rows;
    } catch (e: unknown) {
      app.log.error(e);
      return reply.code(500).send({ error: "Failed to search organizations" });
    }
  });

  app.get("/api/organizations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await db.query(
        `select o.id, o.name, o.description, o.raised, o.goal, o.donor_count, o.image_url,
                o.cover_image_url, o.category_id, o.verified, o.contact_email, o.website,
                o.created_at,
                coalesce(s.tier, 'free') as org_tier
         from organizations o
         left join lateral (
           select tier from org_subscriptions
           where org_id = o.id and status = 'active'
           order by created_at desc limit 1
         ) s on true
         where o.id = $1
         limit 1`,
        [id]
      );
      if (!result.rowCount) return reply.code(404).send({ error: "Organization not found" });

      const org = result.rows[0];

      const campResult = await db.query(
        `select id, title, description, main_image_url, goal, raised, donor_count, status
         from campaigns
         where organization_id = $1 and status = 'active'
         order by created_at desc`,
        [id]
      );
      org.campaigns = campResult.rows;

      return org;
    } catch (e: unknown) {
      app.log.error(e);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  app.get("/api/organizations/category/:categoryId", async (request, reply) => {
    const { categoryId } = request.params as { categoryId: string };
    try {
      const result = await db.query(
        `select id, name, description, raised, goal, donor_count, image_url, category_id
         from organizations
         where archived_at is null and category_id = $1
         order by featured desc nulls last, created_at desc
         limit 100`,
        [categoryId]
      );
      return result.rows;
    } catch (e: unknown) {
      app.log.error(e);
      return reply.code(500).send({ error: "Failed to fetch organizations by category" });
    }
  });

  app.post("/api/volunteers", async (request, reply) => {
    const raw = (request.body ?? {}) as {
      orgId?: string;
      name?: string;
      email?: string;
      skills?: string | string[];
      phone?: string;
      message?: string;
      availability?: string;
    };
    if (!raw.name || !raw.email) {
      return reply.code(400).send({ error: "Name and email are required" });
    }
    let skillsStr: string | null = null;
    if (raw.skills != null) {
      if (Array.isArray(raw.skills)) {
        skillsStr = raw.skills.map((s) => String(s).trim()).filter(Boolean).join(", ") || null;
      } else {
        skillsStr = String(raw.skills).trim() || null;
      }
    }
    let messageStr = raw.message?.trim() || null;
    if (raw.availability && String(raw.availability).trim()) {
      const avail = String(raw.availability).trim();
      messageStr = messageStr ? `${messageStr}\n\nAvailability: ${avail}` : `Availability: ${avail}`;
    }
    const phoneStr = raw.phone?.trim() || null;

    if (raw.orgId) {
      const subRes = await db.query(
        `select tier from org_subscriptions
         where org_id = $1 and status in ('active', 'trialing')
         order by created_at desc limit 1`,
        [raw.orgId]
      );
      const tier = (subRes.rows[0] as Record<string, unknown> | undefined)?.tier as string || "free";
      const VOLUNTEER_ALLOWED_TIERS = ["growth", "institutional"];
      if (!VOLUNTEER_ALLOWED_TIERS.includes(tier)) {
        return reply.code(403).send({ error: "Volunteer signup is only available for organizations on Growth or Institutional plans" });
      }
    }
    try {
      const result = await db.query(
        `insert into volunteers (org_id, name, email, phone, skills, message)
         values ($1, $2, $3, $4, $5, $6)
         returning id`,
        [raw.orgId || null, raw.name, raw.email, phoneStr, skillsStr, messageStr]
      );
      const vid = result.rows[0]?.id;
      if (raw.orgId && vid) {
        const { notifyVolunteerSignup } = await import("../services/user-push.js");
        void notifyVolunteerSignup(raw.orgId, String(raw.name), String(vid)).catch((err) =>
          console.error("[volunteers] push notify failed", err)
        );
      }
      return { success: true, id: vid };
    } catch (e: unknown) {
      app.log.error(e);
      return reply.code(500).send({ error: "Internal server error" });
    }
  });

  app.post("/api/public/donate-checkout", async (request, reply) => {
    const body = publicDonateSchema.parse(request.body);

    if (!env.STRIPE_SECRET_KEY) {
      return reply.code(503).send({ error: "Payments are not configured" });
    }
    const stripe = getStripe();

    const campRes = await db.query(
      `select c.id, c.title, c.status, c.organization_id, o.name as org_name
       from campaigns c
       join organizations o on o.id = c.organization_id
       where c.id = $1`,
      [body.campaignId]
    );
    const camp = campRes.rows[0] as Record<string, unknown> | undefined;
    if (!camp) {
      return reply.code(404).send({ error: "Campaign not found" });
    }
    if (camp.status !== "active") {
      return reply.code(400).send({ error: "This campaign is no longer accepting donations" });
    }
    if (camp.organization_id !== body.orgId) {
      return reply.code(400).send({ error: "Campaign does not belong to this organization" });
    }

    const orgName = camp.org_name as string || "Organization";
    const campaignTitle = camp.title as string || "";

    const description = campaignTitle
      ? `Donation to ${orgName} - ${campaignTitle}`
      : `Donation to ${orgName}`;

    const adminDomain = env.EXPO_PUBLIC_API_URL
      ? env.EXPO_PUBLIC_API_URL.replace(/\/app\/?$/, "").replace(/\/$/, "")
      : `${request.protocol}://${request.hostname}`;

    const successUrl = `${adminDomain}/admin/c/${body.campaignId}?donation=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${adminDomain}/admin/c/${body.campaignId}?donation=canceled`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: body.donorEmail,
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
      payment_intent_data: {
        metadata: {
          orgId: body.orgId,
          campaignId: body.campaignId,
          donorName: body.donorName,
          donorEmail: body.donorEmail,
          message: body.message,
          isAnonymous: String(body.isAnonymous),
          type: "web_donation",
        },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        orgId: body.orgId,
        campaignId: body.campaignId,
        donorEmail: body.donorEmail,
      },
    });

    const donationStripeKey = stripeId(session.payment_intent) ?? session.id;

    const pubPiId = stripeId(session.payment_intent);
    if (pubPiId) {
      await stripe.paymentIntents.update(pubPiId, {
        metadata: {
          orgId: body.orgId,
          campaignId: body.campaignId,
          donorName: body.donorName,
          donorEmail: body.donorEmail,
          message: body.message || "",
          isAnonymous: String(body.isAnonymous),
          type: "web_donation",
          checkoutSessionId: session.id,
        },
      });
    }

    await db.query(
      `insert into donations (org_id, campaign_id, amount, currency, status, stripe_payment_intent_id, donor_name, donor_email, message, is_anonymous)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        body.orgId,
        body.campaignId,
        body.amount,
        body.currency,
        "pending",
        donationStripeKey,
        body.donorName,
        body.donorEmail,
        body.message || null,
        body.isAnonymous,
      ]
    );

    return { url: session.url, sessionId: session.id };
  });

  app.get("/api/community-campaigns", async (request) => {
    const q = request.query as Record<string, string>;
    const limit = Math.min(100, Math.max(1, parseInt(q.limit || "30", 10)));
    const values: unknown[] = [];
    const where: string[] = ["cc.status = 'active'"];
    if (q.category_id) {
      values.push(q.category_id);
      where.push(`cc.category_id = $${values.length}`);
    }
    if (q.search) {
      values.push(`%${q.search}%`);
      where.push(`(cc.title ilike $${values.length} or cc.description ilike $${values.length})`);
    }
    const w = where.length ? `where ${where.join(" and ")}` : "";
    const result = await db.query(
      `select cc.id, cc.title, cc.description, cc.goal_amount as goal, cc.raised_amount as raised,
              cc.status, cc.category_id, cc.verification_status, cc.created_at,
              u.full_name as creator_name, cat.name as category_name
       from community_campaigns cc
       left join users u on u.id = cc.creator_id
       left join categories cat on cat.id = cc.category_id
       ${w} order by cc.created_at desc limit $${values.length + 1}`,
      [...values, limit]
    );
    return result.rows;
  });

  app.get("/api/community-campaigns/categories", async () => {
    const result = await db.query(
      `select distinct cat.id, cat.name
       from categories cat
       inner join community_campaigns cc on cc.category_id = cat.id and cc.status = 'active'
       order by cat.name`
    );
    return result.rows;
  });
};

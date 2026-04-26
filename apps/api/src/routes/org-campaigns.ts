import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { resolveOrgForCharityUser } from "../lib/charity-org.js";
import { TIER_LIMITS } from "../lib/tier-limits.js";
import { notifyAdminsNewCampaign } from "../services/admin-notify.js";

const MAX_TEXT = 20000;

async function resolveOrgTierLimits(orgId: string): Promise<{ tier: string; limits: (typeof TIER_LIMITS)["free"] }> {
  const subRes = await db.query(
    `select tier from org_subscriptions where org_id = $1
     order by
       (stripe_subscription_id is not null) desc,
       case when status in ('active', 'trialing') then 1 else 0 end desc,
       updated_at desc nulls last,
       created_at desc
     limit 1`,
    [orgId]
  );
  const tier = String((subRes.rows[0] as { tier?: string } | undefined)?.tier || "free").toLowerCase();
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
  return { tier, limits };
}

export const orgCampaignRoutes: FastifyPluginAsync = async (app) => {
  const orgProfileUpdateSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    website: z.string().trim().max(300).optional(),
    category_id: z.union([z.string().trim().min(1), z.null()]).optional(),
    bank_name: z.union([z.string().trim().max(200), z.null()]).optional(),
    account_holder_name: z.union([z.string().trim().max(200), z.null()]).optional(),
    routing_number: z.union([z.string().trim().max(32), z.null()]).optional(),
    account_last4: z.union([z.string().trim().max(4), z.null()]).optional(),
    tax_id: z.union([z.string().trim().max(50), z.null()]).optional(),
  });

  const orgCoverImageSchema = z.object({
    cover_image_url: z.string().trim().min(1).max(2000),
  });

  async function resolveOrgIdForUserOr403(input: { userId: string }) {
    const userRes = await db.query("select email from users where id = $1", [input.userId]);
    const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
    if (!email) return { ok: false as const, status: 401 as const, error: "User not found" };
    const orgResolved = await resolveOrgForCharityUser(input.userId, email);
    if (!orgResolved) return { ok: false as const, status: 403 as const, error: "No organization linked to your account" };
    return { ok: true as const, orgId: orgResolved.id };
  }

  app.get(
    "/api/org/my-campaigns",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const org = await resolveOrgForCharityUser(user.sub, email);
      if (!org) return { campaigns: [], org_id: null, org_stats: null };

      const [result, periodRes] = await Promise.all([
        db.query(
          `select c.id, c.title, c.description, c.story, c.about, c.status, c.goal,
                  coalesce(cd.raised, 0) as raised,
                  coalesce(cd.donor_count, 0)::int as donor_count,
                  c.main_image_url as image_url, c.location, c.created_at
           from campaigns c
           left join lateral (
             select coalesce(sum(d.amount), 0)::numeric as raised,
                    count(*)::int as donor_count
             from donations d
             where d.campaign_id = c.id
               and lower(trim(coalesce(d.status::text, ''))) = 'succeeded'
           ) cd on true
           where c.organization_id = $1
           order by c.created_at desc`,
          [org.id]
        ),
        db.query(
          `select
             (select count(*)::int
                from donations d2
                inner join campaigns c2 on c2.id = d2.campaign_id
                where c2.organization_id = $1
                  and lower(trim(coalesce(d2.status::text, ''))) = 'succeeded') as campaign_linked_donation_count,
             (select coalesce(sum(d.amount), 0)::numeric
                from donations d
                inner join campaigns c on c.id = d.campaign_id
                where c.organization_id = $1
                  and lower(trim(coalesce(d.status::text, ''))) = 'succeeded'
                  and d.created_at >= date_trunc('month', now())) as month_raised,
             (select count(*)::int
                from donations d
                inner join campaigns c on c.id = d.campaign_id
                where c.organization_id = $1
                  and lower(trim(coalesce(d.status::text, ''))) = 'succeeded'
                  and d.created_at >= date_trunc('month', now())) as month_donation_count,
             (select coalesce(sum(d.amount), 0)::numeric
                from donations d
                inner join campaigns c on c.id = d.campaign_id
                where c.organization_id = $1
                  and lower(trim(coalesce(d.status::text, ''))) = 'succeeded'
                  and d.created_at >= now() - interval '7 days') as last_7d_raised,
             (select count(*)::int
                from donations d
                inner join campaigns c on c.id = d.campaign_id
                where c.organization_id = $1
                  and lower(trim(coalesce(d.status::text, ''))) = 'succeeded'
                  and d.created_at >= now() - interval '7 days') as last_7d_donation_count,
             (select coalesce(sum(d.amount), 0)::numeric
                from donations d
                inner join campaigns c on c.id = d.campaign_id
                where c.organization_id = $1
                  and lower(trim(coalesce(d.status::text, ''))) = 'succeeded'
                  and d.created_at >= now() - interval '30 days') as last_30d_raised,
             (select count(*)::int
                from donations d
                inner join campaigns c on c.id = d.campaign_id
                where c.organization_id = $1
                  and lower(trim(coalesce(d.status::text, ''))) = 'succeeded'
                  and d.created_at >= now() - interval '30 days') as last_30d_donation_count,
             (select coalesce(sum(d.amount), 0)::numeric
                from donations d
                inner join campaigns c on c.id = d.campaign_id
                where c.organization_id = $1
                  and lower(trim(coalesce(d.status::text, ''))) = 'succeeded'
                  and d.created_at >= now() - interval '90 days') as last_90d_raised,
             (select count(*)::int
                from donations d
                inner join campaigns c on c.id = d.campaign_id
                where c.organization_id = $1
                  and lower(trim(coalesce(d.status::text, ''))) = 'succeeded'
                  and d.created_at >= now() - interval '90 days') as last_90d_donation_count`,
          [org.id]
        ),
      ]);

      const rows = result.rows as Array<{ raised: unknown; donor_count: unknown }>;
      let totalRaised = 0;
      let donorsCountSum = 0;
      for (const r of rows) {
        totalRaised += Number(r.raised ?? 0);
        donorsCountSum += Number(r.donor_count ?? 0);
      }
      const pr = periodRes.rows[0] as
        | {
            campaign_linked_donation_count?: unknown;
            month_raised?: unknown;
            month_donation_count?: unknown;
            last_7d_raised?: unknown;
            last_7d_donation_count?: unknown;
            last_30d_raised?: unknown;
            last_30d_donation_count?: unknown;
            last_90d_raised?: unknown;
            last_90d_donation_count?: unknown;
          }
        | undefined;

      return {
        campaigns: result.rows,
        org_id: org.id,
        org_stats: {
          total_raised: totalRaised,
          donors_count_sum: donorsCountSum,
          campaign_linked_donation_count: Number(pr?.campaign_linked_donation_count ?? 0),
          month_raised: Number(pr?.month_raised ?? 0),
          month_donation_count: Number(pr?.month_donation_count ?? 0),
          last_7d_raised: Number(pr?.last_7d_raised ?? 0),
          last_7d_donation_count: Number(pr?.last_7d_donation_count ?? 0),
          last_30d_raised: Number(pr?.last_30d_raised ?? 0),
          last_30d_donation_count: Number(pr?.last_30d_donation_count ?? 0),
          last_90d_raised: Number(pr?.last_90d_raised ?? 0),
          last_90d_donation_count: Number(pr?.last_90d_donation_count ?? 0),
        },
      };
    }
  );

  app.put(
    "/api/org/cover-image",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const resolved = await resolveOrgIdForUserOr403({ userId: user.sub });
      if (!resolved.ok) return reply.code(resolved.status).send({ error: resolved.error });

      const body = orgCoverImageSchema.parse(request.body ?? {});
      await db.query("update organizations set cover_image_url = $1 where id = $2", [body.cover_image_url, resolved.orgId]);
      return { cover_image_url: body.cover_image_url, org_id: resolved.orgId };
    }
  );

  app.delete(
    "/api/org/cover-image",
    { preHandler: [app.authenticate] },
    async (request) => {
      const user = request.user as { sub: string };
      const resolved = await resolveOrgIdForUserOr403({ userId: user.sub });
      if (!resolved.ok) return { success: false, error: resolved.error };

      await db.query("update organizations set cover_image_url = null where id = $1", [resolved.orgId]);
      return { success: true, org_id: resolved.orgId };
    }
  );

  app.post(
    "/api/org/campaigns",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      try {
        const userRes = await db.query("select email from users where id = $1", [user.sub]);
        const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
        if (!email) return reply.code(401).send({ error: "User not found" });

        const org = await resolveOrgForCharityUser(user.sub, email);
        if (!org) return reply.code(403).send({ error: "No organization linked to your account" });
        const orgId = org.id;
        const orgName = org.name || "Organization";

        const body = (request.body ?? {}) as Record<string, unknown>;
        const title = String(body.title || "").trim();
        if (!title) return reply.code(400).send({ error: "Campaign title is required" });
        if (title.length > 500) return reply.code(400).send({ error: "Campaign title is too long" });

        const goal = parseFloat(String(body.goal ?? ""));
        if (!Number.isFinite(goal) || goal <= 0) {
          return reply.code(400).send({ error: "Goal must be a positive number" });
        }

        const { limits } = await resolveOrgTierLimits(orgId);
        if (limits.max_goal_per_campaign < 999999999 && goal > limits.max_goal_per_campaign) {
          return reply.code(400).send({
            error: `Goal exceeds your plan limit of $${limits.max_goal_per_campaign.toLocaleString()} per campaign`,
          });
        }

        const countRes = await db.query(
          "select count(*)::int as c from campaigns where organization_id = $1",
          [orgId]
        );
        const existing = Number((countRes.rows[0] as { c?: number } | undefined)?.c ?? 0);
        if (limits.max_community_campaigns < 999999 && existing >= limits.max_community_campaigns) {
          return reply.code(400).send({
            error: `Your plan allows ${limits.max_community_campaigns} campaign(s). Upgrade to create more.`,
          });
        }

        const description = String(body.description || "").trim();
        const storyRaw = String(body.story || "").trim();
        const aboutRaw = String(body.about || "").trim();
        if (description.length > MAX_TEXT || storyRaw.length > MAX_TEXT || aboutRaw.length > MAX_TEXT) {
          return reply.code(400).send({ error: "Description fields are too long" });
        }
        const story = storyRaw || null;
        const about = aboutRaw || null;
        const locationTrimmed = String(body.location || "").trim();
        if (locationTrimmed.length > 500) return reply.code(400).send({ error: "Location is too long" });
        const location = locationTrimmed || null;
        const imageTrimmed = String(body.image_url || "").trim();
        if (imageTrimmed.length > 2000) return reply.code(400).send({ error: "Image URL is too long" });
        const imageUrl = imageTrimmed || null;

        const galleryRaw = (body.gallery ?? null) as unknown;
        const gallery = Array.isArray(galleryRaw) ? galleryRaw : [];
        if (gallery.length > 5) return reply.code(400).send({ error: "At most 5 gallery images are allowed" });
        const galleryItems = gallery.map((x) => {
          const o = x as { image_url?: unknown; caption?: unknown };
          return {
            image_url: String(o.image_url ?? "").trim(),
            caption: o.caption == null ? null : String(o.caption).trim().slice(0, 240) || null,
          };
        }).filter((g) => g.image_url);

        const id = `camp-${Date.now()}`;

        await db.query(
          `insert into campaigns (id, title, description, story, about, goal, raised, status, organization_id, location, main_image_url, created_at)
           values ($1, $2, $3, $4, $5, $6, 0, 'pending_review', $7, $8, $9, now())`,
          [id, title, description, story, about, goal, orgId, location, imageUrl]
        );

        if (galleryItems.length) {
          const values: unknown[] = [];
          const chunks: string[] = [];
          let order = 0;
          for (const g of galleryItems.slice(0, 5)) {
            const imgId = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            values.push(imgId, id, orgId, g.image_url, g.caption, order++);
            const o = (values.length / 6 - 1) * 6;
            chunks.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6})`);
          }
          await db.query(
            `insert into campaign_images (id, campaign_id, org_id, image_url, caption, sort_order) values ${chunks.join(", ")}`,
            values
          );
        }

        await notifyAdminsNewCampaign({
          campaignId: id,
          title,
          orgName,
        }).catch(() => {});

        return { success: true, id, status: "pending_review" as const };
      } catch (err: unknown) {
        request.log.error({ err }, "org campaign create");
        const msg =
          err instanceof Error && err.message.includes("body")
            ? "Request payload too large or invalid. Shorten the description and try again."
            : "Could not create campaign. Please try again or contact support.";
        return reply.code(503).send({ error: msg });
      }
    }
  );

  app.put(
    "/api/org/campaigns/:campaignId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const { campaignId } = request.params as { campaignId: string };

      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const org = await resolveOrgForCharityUser(user.sub, email);
      if (!org) return reply.code(403).send({ error: "No organization linked" });
      const orgId = org.id;

      const campRes = await db.query(
        "select id, status from campaigns where id = $1 and organization_id = $2",
        [campaignId, orgId]
      );
      if (!campRes.rows.length) return reply.code(404).send({ error: "Campaign not found" });
      const currentStatus = (campRes.rows[0] as { status: string }).status;

      const body = request.body as Record<string, unknown>;
      const sets: string[] = [];
      const values: unknown[] = [];
      const allowed = ["title", "description", "story", "about", "goal", "location", "image_url"];
      for (const key of allowed) {
        if (body[key] !== undefined) {
          values.push(body[key]);
          const column = key === "image_url" ? "main_image_url" : key;
          sets.push(`${column} = $${values.length}`);
        }
      }
      // Org users cannot publish pending_review campaigns; only pause/resume already-live campaigns.
      if (body.status !== undefined) {
        const next = String(body.status);
        if (
          (next === "active" || next === "paused") &&
          (currentStatus === "active" || currentStatus === "paused")
        ) {
          values.push(next);
          sets.push(`status = $${values.length}`);
        }
      }
      if (!sets.length) return reply.code(400).send({ error: "No fields to update" });

      values.push(campaignId);
      await db.query(`update campaigns set ${sets.join(", ")} where id = $${values.length}`, values);
      return { success: true };
    }
  );

  app.delete(
    "/api/org/campaigns/:campaignId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const { campaignId } = request.params as { campaignId: string };

      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const org = await resolveOrgForCharityUser(user.sub, email);
      if (!org) return reply.code(403).send({ error: "No organization linked" });
      const orgId = org.id;

      const campRes = await db.query(
        "select id from campaigns where id = $1 and organization_id = $2",
        [campaignId, orgId]
      );
      if (!campRes.rows.length) return reply.code(404).send({ error: "Campaign not found" });

      await db.query("delete from campaigns where id = $1", [campaignId]);
      return { success: true };
    }
  );

  app.get(
    "/api/org/campaign-images/:campaignId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const { campaignId } = request.params as { campaignId: string };

      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const org = await resolveOrgForCharityUser(user.sub, email);
      if (!org) return reply.code(403).send({ error: "No organization linked" });
      const orgId = org.id;

      const campCheck = await db.query("select id from campaigns where id = $1 and organization_id = $2", [campaignId, orgId]);
      if (!campCheck.rows.length) return reply.code(404).send({ error: "Campaign not found" });

      const result = await db.query(
        `select id, image_url, caption, sort_order from campaign_images where campaign_id = $1 order by sort_order asc`,
        [campaignId]
      );
      return { images: result.rows };
    }
  );

  app.post(
    "/api/org/campaign-images/:campaignId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const { campaignId } = request.params as { campaignId: string };

      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const org = await resolveOrgForCharityUser(user.sub, email);
      if (!org) return reply.code(403).send({ error: "No organization linked" });
      const orgId = org.id;

      const campCheck = await db.query("select id from campaigns where id = $1 and organization_id = $2", [campaignId, orgId]);
      if (!campCheck.rows.length) return reply.code(404).send({ error: "Campaign not found" });

      const body = request.body as Record<string, unknown>;
      const imageUrl = String(body.image_url || "").trim();
      if (!imageUrl) return reply.code(400).send({ error: "image_url is required" });

      const caption = String(body.caption || "").trim() || null;
      const sortOrder = parseInt(String(body.sort_order || 0), 10);
      const id = `cimg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      await db.query(
        `insert into campaign_images (id, campaign_id, org_id, image_url, caption, sort_order) values ($1, $2, $3, $4, $5, $6)`,
        [id, campaignId, orgId, imageUrl, caption, sortOrder]
      );
      return { success: true, id, image_url: imageUrl };
    }
  );

  app.delete(
    "/api/org/campaign-images/:imageId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const { imageId } = request.params as { imageId: string };

      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const org = await resolveOrgForCharityUser(user.sub, email);
      if (!org) return reply.code(403).send({ error: "No organization linked" });
      const orgId = org.id;

      const imgRes = await db.query("select id from campaign_images where id = $1 and org_id = $2", [imageId, orgId]);
      if (!imgRes.rows.length) return reply.code(404).send({ error: "Image not found" });

      await db.query("delete from campaign_images where id = $1", [imageId]);
      return { success: true };
    }
  );

  app.get(
    "/api/org/my-donations",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const org = await resolveOrgForCharityUser(user.sub, email);
      if (!org) {
        return {
          donations: [],
          org_id: null,
          stats: null,
        };
      }
      const orgId = org.id;

      const donorKey = `case when coalesce(d.is_anonymous, false) then 'anon:' || d.id::text
            else coalesce(
              nullif(trim(d.donor_email), ''),
              nullif(trim(d.donor_name), ''),
              nullif(trim(u.full_name), ''),
              d.id::text
            ) end`;

      const listSql = `select d.id, d.amount, d.currency, d.status,
              case when coalesce(d.is_anonymous, false) then null
                   else coalesce(
                     nullif(trim(d.donor_name), ''),
                     u.full_name,
                     split_part(lower(trim(coalesce(nullif(trim(d.donor_email), ''), u.email))), '@', 1)
                   )
              end as donor_name,
              case when coalesce(d.is_anonymous, false) then null
                   else coalesce(nullif(trim(d.donor_email), ''), lower(trim(u.email)))
              end as donor_email,
              d.message, d.is_anonymous, d.created_at,
              coalesce(nullif(trim(d.stripe_payment_intent_id), ''), d.id::text) as reference,
              c.title as campaign_title
       from donations d
       left join campaigns c on c.id = d.campaign_id
       left join users u on u.id = d.user_id
       where d.org_id = $1
          or c.organization_id = $1
       order by d.created_at desc
       limit 500`;

      const statsSql = `
        select
          coalesce(sum(d.amount), 0)::numeric as all_time_total,
          count(*)::int as all_time_donation_count,
          count(distinct ${donorKey})::int as all_time_donors,
          coalesce(sum(d.amount) filter (where d.created_at >= date_trunc('month', now())), 0)::numeric as month_total,
          count(*) filter (where d.created_at >= date_trunc('month', now()))::int as month_donation_count,
          count(distinct case when d.created_at >= date_trunc('month', now()) then ${donorKey} end)::int as month_donors,
          coalesce(sum(d.amount) filter (where d.created_at >= now() - interval '7 days'), 0)::numeric as last_7d_total,
          count(*) filter (where d.created_at >= now() - interval '7 days')::int as last_7d_donation_count,
          count(distinct case when d.created_at >= now() - interval '7 days' then ${donorKey} end)::int as last_7d_donors,
          coalesce(sum(d.amount) filter (where d.created_at >= now() - interval '30 days'), 0)::numeric as last_30d_total,
          count(*) filter (where d.created_at >= now() - interval '30 days')::int as last_30d_donation_count,
          count(distinct case when d.created_at >= now() - interval '30 days' then ${donorKey} end)::int as last_30d_donors,
          coalesce(sum(d.amount) filter (where d.created_at >= now() - interval '90 days'), 0)::numeric as last_90d_total,
          count(*) filter (where d.created_at >= now() - interval '90 days')::int as last_90d_donation_count,
          count(distinct case when d.created_at >= now() - interval '90 days' then ${donorKey} end)::int as last_90d_donors
        from donations d
        left join campaigns c on c.id = d.campaign_id
        left join users u on u.id = d.user_id
        where (d.org_id = $1 or c.organization_id = $1)
          and lower(trim(coalesce(d.status::text, ''))) = 'succeeded'`;

      const result = await db.query(listSql, [orgId]);
      let statsRes;
      try {
        statsRes = await db.query(statsSql, [orgId]);
      } catch (err: unknown) {
        request.log.error({ err }, "my-donations stats aggregate failed; using minimal stats");
        statsRes = await db.query(
          `select
             coalesce(sum(d.amount), 0)::numeric as all_time_total,
             count(*)::int as all_time_donation_count,
             0::int as all_time_donors,
             coalesce(sum(d.amount) filter (where d.created_at >= date_trunc('month', now())), 0)::numeric as month_total,
             count(*) filter (where d.created_at >= date_trunc('month', now()))::int as month_donation_count,
             0::int as month_donors,
             coalesce(sum(d.amount) filter (where d.created_at >= now() - interval '7 days'), 0)::numeric as last_7d_total,
             count(*) filter (where d.created_at >= now() - interval '7 days')::int as last_7d_donation_count,
             0::int as last_7d_donors,
             coalesce(sum(d.amount) filter (where d.created_at >= now() - interval '30 days'), 0)::numeric as last_30d_total,
             count(*) filter (where d.created_at >= now() - interval '30 days')::int as last_30d_donation_count,
             0::int as last_30d_donors,
             coalesce(sum(d.amount) filter (where d.created_at >= now() - interval '90 days'), 0)::numeric as last_90d_total,
             count(*) filter (where d.created_at >= now() - interval '90 days')::int as last_90d_donation_count,
             0::int as last_90d_donors
           from donations d
           left join campaigns c on c.id = d.campaign_id
           where (d.org_id = $1 or c.organization_id = $1)
             and lower(trim(coalesce(d.status::text, ''))) = 'succeeded'`,
          [orgId]
        );
      }

      const s = statsRes.rows[0] as Record<string, unknown> | undefined;
      const num = (v: unknown) => (v == null ? 0 : Number(v));
      const int = (v: unknown) => (v == null ? 0 : Number(v));

      const stats = {
        all_time_total: num(s?.all_time_total),
        all_time_donors: int(s?.all_time_donors),
        all_time_donation_count: int(s?.all_time_donation_count),
        month_total: num(s?.month_total),
        month_donors: int(s?.month_donors),
        month_donation_count: int(s?.month_donation_count),
        last_7d_total: num(s?.last_7d_total),
        last_7d_donors: int(s?.last_7d_donors),
        last_7d_donation_count: int(s?.last_7d_donation_count),
        last_30d_total: num(s?.last_30d_total),
        last_30d_donors: int(s?.last_30d_donors),
        last_30d_donation_count: int(s?.last_30d_donation_count),
        last_90d_total: num(s?.last_90d_total),
        last_90d_donors: int(s?.last_90d_donors),
        last_90d_donation_count: int(s?.last_90d_donation_count),
      };

      return { donations: result.rows, org_id: orgId, stats };
    }
  );

  app.get(
    "/api/org/profile",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const resolved = await resolveOrgForCharityUser(user.sub, email);
      if (!resolved) return reply.code(404).send({ error: "No organization linked to your account" });

      const orgRes = await db.query(
        `select o.id, o.name, o.description, o.image_url, o.cover_image_url, o.website,
                o.category_id, c.name as category_name,
                o.payouts_enabled,
                (o.stripe_account_id is not null) as stripe_connected,
                o.bank_name, o.account_holder_name, o.account_last4, o.routing_number, o.tax_id
         from organizations o
         left join categories c on c.id = o.category_id
         where o.id = $1 limit 1`,
        [resolved.id]
      );
      const row = orgRes.rows[0] as Record<string, unknown> | undefined;
      if (!row) return reply.code(404).send({ error: "No organization linked to your account" });

      const org = {
        ...row,
        payouts_enabled: Boolean(row.payouts_enabled),
        stripe_connected: Boolean(row.stripe_connected),
      };
      return { org };
    }
  );

  app.put(
    "/api/org/profile",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const orgResolved = await resolveOrgForCharityUser(user.sub, email);
      if (!orgResolved) return reply.code(403).send({ error: "No organization linked to your account" });
      const orgId = orgResolved.id;

      const body = orgProfileUpdateSchema.parse(request.body);

      if (body.category_id !== undefined && body.category_id !== null) {
        const cat = await db.query("select id from categories where id = $1 limit 1", [body.category_id]);
        if (!cat.rowCount) return reply.code(400).send({ error: "Invalid category" });
      }

      const sets: string[] = [];
      const vals: unknown[] = [];
      const push = (sql: string, v: unknown) => {
        vals.push(v);
        sets.push(`${sql} = $${vals.length}`);
      };
      if (body.name !== undefined) push("name", body.name);
      if (body.description !== undefined) push("description", body.description);
      if (body.website !== undefined) push("website", body.website);
      if (body.category_id !== undefined) push("category_id", body.category_id);
      if (body.bank_name !== undefined) push("bank_name", body.bank_name);
      if (body.account_holder_name !== undefined) push("account_holder_name", body.account_holder_name);
      if (body.routing_number !== undefined) push("routing_number", body.routing_number);
      if (body.account_last4 !== undefined) push("account_last4", body.account_last4);
      if (body.tax_id !== undefined) push("tax_id", body.tax_id);

      if (sets.length) {
        vals.push(orgId);
        await db.query(`update organizations set ${sets.join(", ")} where id = $${vals.length}`, vals);
      }

      const updatedRes = await db.query(
        `select o.id, o.name, o.description, o.image_url, o.cover_image_url, o.website,
                o.category_id, c.name as category_name,
                o.payouts_enabled,
                (o.stripe_account_id is not null) as stripe_connected,
                o.bank_name, o.account_holder_name, o.account_last4, o.routing_number, o.tax_id
         from organizations o
         left join categories c on c.id = o.category_id
         where o.id = $1 limit 1`,
        [orgId]
      );
      const row = updatedRes.rows[0] as Record<string, unknown> | undefined;
      const org = row
        ? {
            ...row,
            payouts_enabled: Boolean(row.payouts_enabled),
            stripe_connected: Boolean(row.stripe_connected),
          }
        : undefined;
      return { org };
    }
  );

  app.put(
    "/api/org/profile-image",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const orgResolved = await resolveOrgForCharityUser(user.sub, email);
      if (!orgResolved) return reply.code(403).send({ error: "No organization linked to your account" });
      const orgId = orgResolved.id;

      const body = request.body as { image_url?: string };
      if (!body.image_url) return reply.code(400).send({ error: "image_url is required" });

      await db.query("update organizations set image_url = $1 where id = $2", [body.image_url, orgId]);

      return { image_url: body.image_url, org_id: orgId };
    }
  );
};

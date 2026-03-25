import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";

export const orgCampaignRoutes: FastifyPluginAsync = async (app) => {
  const orgProfileUpdateSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    website: z.string().trim().max(300).optional(),
  });

  app.get(
    "/api/org/my-campaigns",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const orgRes = await db.query(
        "select id from organizations where contact_email = $1 limit 1",
        [email]
      );
      const orgId = (orgRes.rows[0] as Record<string, unknown> | undefined)?.id as string | null;
      if (!orgId) return { campaigns: [], org_id: null };

      const result = await db.query(
        `select id, title, description, story, about, status, goal,
                coalesce(raised, 0) as raised, image_url, location, created_at
         from campaigns
         where organization_id = $1
         order by created_at desc`,
        [orgId]
      );
      return { campaigns: result.rows, org_id: orgId };
    }
  );

  app.post(
    "/api/org/campaigns",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const orgRes = await db.query(
        "select id from organizations where contact_email = $1 limit 1",
        [email]
      );
      const orgId = (orgRes.rows[0] as Record<string, unknown> | undefined)?.id as string | null;
      if (!orgId) return reply.code(403).send({ error: "No organization linked to your account" });

      const body = request.body as Record<string, unknown>;
      const title = String(body.title || "").trim();
      if (!title) return reply.code(400).send({ error: "Campaign title is required" });

      const id = `camp-${Date.now()}`;
      const goal = parseFloat(String(body.goal || 0));
      const description = String(body.description || "").trim();
      const story = String(body.story || "").trim() || null;
      const about = String(body.about || "").trim() || null;
      const location = String(body.location || "").trim() || null;
      const imageUrl = String(body.image_url || "").trim() || null;

      await db.query(
        `insert into campaigns (id, title, description, story, about, goal, raised, status, organization_id, location, image_url, created_at)
         values ($1, $2, $3, $4, $5, $6, 0, 'active', $7, $8, $9, now())`,
        [id, title, description, story, about, goal, orgId, location, imageUrl]
      );

      return { success: true, id };
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

      const orgRes = await db.query(
        "select id from organizations where contact_email = $1 limit 1",
        [email]
      );
      const orgId = (orgRes.rows[0] as Record<string, unknown> | undefined)?.id as string | null;
      if (!orgId) return reply.code(403).send({ error: "No organization linked" });

      const campRes = await db.query(
        "select id from campaigns where id = $1 and organization_id = $2",
        [campaignId, orgId]
      );
      if (!campRes.rows.length) return reply.code(404).send({ error: "Campaign not found" });

      const body = request.body as Record<string, unknown>;
      const sets: string[] = [];
      const values: unknown[] = [];
      const allowed = ["title", "description", "story", "about", "goal", "status", "location", "image_url"];
      for (const key of allowed) {
        if (body[key] !== undefined) {
          values.push(body[key]);
          sets.push(`${key} = $${values.length}`);
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

      const orgRes = await db.query(
        "select id from organizations where contact_email = $1 limit 1",
        [email]
      );
      const orgId = (orgRes.rows[0] as Record<string, unknown> | undefined)?.id as string | null;
      if (!orgId) return reply.code(403).send({ error: "No organization linked" });

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

      const orgRes = await db.query("select id from organizations where contact_email = $1 limit 1", [email]);
      const orgId = (orgRes.rows[0] as Record<string, unknown> | undefined)?.id as string | null;
      if (!orgId) return reply.code(403).send({ error: "No organization linked" });

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

      const orgRes = await db.query("select id from organizations where contact_email = $1 limit 1", [email]);
      const orgId = (orgRes.rows[0] as Record<string, unknown> | undefined)?.id as string | null;
      if (!orgId) return reply.code(403).send({ error: "No organization linked" });

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

      const orgRes = await db.query("select id from organizations where contact_email = $1 limit 1", [email]);
      const orgId = (orgRes.rows[0] as Record<string, unknown> | undefined)?.id as string | null;
      if (!orgId) return reply.code(403).send({ error: "No organization linked" });

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

      const orgRes = await db.query(
        "select id from organizations where contact_email = $1 limit 1",
        [email]
      );
      const orgId = (orgRes.rows[0] as Record<string, unknown> | undefined)?.id as string | null;
      if (!orgId) return { donations: [], org_id: null };

      const result = await db.query(
        `select d.id, d.amount, d.currency, d.status, d.donor_name, d.donor_email,
                d.message, d.is_anonymous, d.created_at, d.reference,
                c.title as campaign_title
         from donations d
         left join campaigns c on c.id = d.campaign_id
         where d.org_id = $1
         order by d.created_at desc
         limit 500`,
        [orgId]
      );

      return { donations: result.rows, org_id: orgId };
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

      const orgRes = await db.query(
        "select id, name, description, image_url, cover_image_url, website from organizations where contact_email = $1 limit 1",
        [email]
      );
      const org = orgRes.rows[0] as Record<string, unknown> | undefined;
      if (!org) return reply.code(404).send({ error: "No organization linked to your account" });

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

      const orgRes = await db.query(
        "select id from organizations where contact_email = $1 limit 1",
        [email]
      );
      const orgId = (orgRes.rows[0] as Record<string, unknown> | undefined)?.id as string | null;
      if (!orgId) return reply.code(403).send({ error: "No organization linked to your account" });

      const body = orgProfileUpdateSchema.parse(request.body);

      const name = body.name;
      const description = body.description;
      const website = body.website;

      // Update only provided fields; keep existing values otherwise.
      await db.query(
        `update organizations
         set
           name = coalesce($1, name),
           description = coalesce($2, description),
           website = coalesce($3, website)
         where id = $4`,
        [name ?? null, description ?? null, website ?? null, orgId]
      );

      const updatedRes = await db.query(
        "select id, name, description, image_url, cover_image_url, website from organizations where id = $1 limit 1",
        [orgId]
      );
      const org = updatedRes.rows[0] as Record<string, unknown> | undefined;
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

      const orgRes = await db.query(
        "select id from organizations where contact_email = $1 limit 1",
        [email]
      );
      const orgId = (orgRes.rows[0] as Record<string, unknown> | undefined)?.id as string | null;
      if (!orgId) return reply.code(403).send({ error: "No organization linked to your account" });

      const body = request.body as { image_url?: string };
      if (!body.image_url) return reply.code(400).send({ error: "image_url is required" });

      await db.query("update organizations set image_url = $1 where id = $2", [body.image_url, orgId]);

      return { image_url: body.image_url, org_id: orgId };
    }
  );
};

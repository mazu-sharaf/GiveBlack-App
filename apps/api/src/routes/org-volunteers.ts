import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../lib/db.js";
import { resolveOrgForCharityUser } from "../lib/charity-org.js";
import { notifyVolunteerApproved } from "../services/admin-notify.js";

const patchBodySchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

export const orgVolunteerRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/org/volunteers",
    { preHandler: [app.authenticate, app.requireRole("charity_owner")] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as { email?: string } | undefined)?.email;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const org = await resolveOrgForCharityUser(user.sub, email);
      if (!org) return reply.code(403).send({ error: "No organization linked to your account" });

      const result = await db.query(
        `select id, org_id, campaign_id, name, email, phone, skills, message, status, created_at
         from volunteers
         where org_id = $1
         order by created_at desc`,
        [org.id]
      );
      return { volunteers: result.rows };
    }
  );

  app.patch(
    "/api/org/volunteers/:id",
    { preHandler: [app.authenticate, app.requireRole("charity_owner")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = patchBodySchema.parse(request.body);
      const user = request.user as { sub: string };

      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as { email?: string } | undefined)?.email;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const org = await resolveOrgForCharityUser(user.sub, email);
      if (!org) return reply.code(403).send({ error: "No organization linked to your account" });

      const volRes = await db.query(
        `select id, org_id, name, email, status from volunteers where id = $1`,
        [id]
      );
      const row = volRes.rows[0] as
        | { id: string; org_id: string | null; name: string | null; email: string | null; status: string }
        | undefined;
      if (!row || row.org_id !== org.id) {
        return reply.code(404).send({ error: "Volunteer not found" });
      }

      const prevStatus = row.status;
      await db.query(`update volunteers set status = $1 where id = $2`, [body.status, id]);

      if (body.status === "approved" && prevStatus !== "approved" && row.email) {
        await notifyVolunteerApproved({
          volunteerEmail: row.email,
          volunteerName: row.name?.trim() || "Volunteer",
          orgName: org.name || "Organization",
        }).catch((err) => {
          request.log.warn({ err }, "volunteer approval email failed");
        });
      }

      return { success: true, status: body.status };
    }
  );
};

import type { FastifyPluginAsync } from "fastify";
import { db } from "../lib/db.js";

function normalizePartnerCode(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const educationPartnersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/education-partners/lookup", async (request, reply) => {
    const q = request.query as { code?: string };
    const raw = (q.code || "").trim();
    if (!raw) {
      return reply.code(400).send({ error: "code query parameter required" });
    }
    const normalized = normalizePartnerCode(raw);
    if (!normalized) {
      return reply.code(404).send({ error: "Partner not found" });
    }
    const res = await db.query(
      `select id::text, code, name from education_partners
       where lower(code) = $1 and active = true`,
      [normalized]
    );
    const row = res.rows[0] as { id: string; code: string; name: string } | undefined;
    if (!row) {
      return reply.code(404).send({ error: "Partner not found" });
    }
    return { id: row.id, code: row.code, name: row.name };
  });
};

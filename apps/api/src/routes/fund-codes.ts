import type { FastifyPluginAsync } from "fastify";
import { resolveFundCode } from "../lib/fund-codes.js";

function normalizeCode(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const fundCodesRoutes: FastifyPluginAsync = async (app) => {
  /** Public lookup for organizational / education fund codes at checkout */
  app.get("/api/fund-codes/lookup", async (request, reply) => {
    const q = request.query as { code?: string };
    const raw = (q.code || "").trim();
    if (!raw) {
      return reply.code(400).send({ error: "code query parameter required" });
    }
    const normalized = normalizeCode(raw);
    if (!normalized) {
      return reply.code(404).send({ error: "Code not found" });
    }

    const fund = await resolveFundCode(raw);
    if (!fund) {
      return reply.code(404).send({ error: "Code not found" });
    }

    return {
      id: fund.partnerId,
      code: fund.code,
      name: fund.name,
      organizationId: fund.organizationId,
      organizationName: fund.organizationName,
      receivesEducation: fund.receivesEducation,
      receivesEndowment: fund.receivesEndowment,
    };
  });

  /** Backward-compatible alias for education partner lookup */
  app.get("/api/education-partners/lookup", async (request, reply) => {
    const q = request.query as { code?: string };
    const raw = (q.code || "").trim();
    if (!raw) {
      return reply.code(400).send({ error: "code query parameter required" });
    }
    const fund = await resolveFundCode(raw);
    if (!fund) {
      return reply.code(404).send({ error: "Partner not found" });
    }
    return { id: fund.partnerId, code: fund.code, name: fund.name };
  });
};

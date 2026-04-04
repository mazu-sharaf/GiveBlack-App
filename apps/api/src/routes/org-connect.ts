import type { FastifyPluginAsync } from "fastify";
import { db } from "../lib/db.js";
import { resolveOrgForCharityUser } from "../lib/charity-org.js";
import { env } from "../config/env.js";
import { getStripe } from "../services/stripe.js";

function publicWebOrigin(): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  const api = env.EXPO_PUBLIC_API_URL?.replace(/\/app\/?$/, "").replace(/\/$/, "");
  if (api) return api;
  return `https://${process.env.EXPO_PUBLIC_DOMAIN || "giveblackapp.com"}`;
}

export const orgConnectRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/org/connect/status",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const resolved = await resolveOrgForCharityUser(user.sub, email);
      if (!resolved) return reply.code(404).send({ error: "No organization linked to your account" });

      const orgRes = await db.query(
        "select id, stripe_account_id, payouts_enabled from organizations where id = $1 limit 1",
        [resolved.id]
      );
      const row = orgRes.rows[0] as
        | { id: string; stripe_account_id?: string | null; payouts_enabled?: boolean }
        | undefined;
      if (!row) return reply.code(404).send({ error: "No organization linked to your account" });

      return {
        connected: Boolean(row.stripe_account_id),
        payouts_enabled: Boolean(row.payouts_enabled),
        details_submitted: Boolean(row.stripe_account_id),
      };
    }
  );

  app.post(
    "/api/org/connect/onboard",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!env.STRIPE_SECRET_KEY) return reply.code(503).send({ error: "Stripe not configured" });

      const user = request.user as { sub: string };
      const userRes = await db.query("select email from users where id = $1", [user.sub]);
      const email = (userRes.rows[0] as Record<string, unknown> | undefined)?.email as string | undefined;
      if (!email) return reply.code(401).send({ error: "User not found" });

      const resolved = await resolveOrgForCharityUser(user.sub, email);
      if (!resolved) return reply.code(404).send({ error: "No organization linked to your account" });

      const orgRes = await db.query(
        "select id, name, stripe_account_id from organizations where id = $1 limit 1",
        [resolved.id]
      );
      const row = orgRes.rows[0] as { id: string; name: string; stripe_account_id?: string | null } | undefined;
      if (!row) return reply.code(404).send({ error: "No organization linked to your account" });

      const stripe = getStripe();
      let accountId: string | null = row.stripe_account_id ?? null;
      if (!accountId) {
        const account = await stripe.accounts.create({
          type: "express",
          business_type: "company",
          metadata: { org_id: row.id, org_name: row.name },
        });
        accountId = account.id;
        await db.query("update organizations set stripe_account_id = $2 where id = $1", [row.id, accountId]);
      }

      const origin = publicWebOrigin();
      const link = await stripe.accountLinks.create({
        account: accountId,
        type: "account_onboarding",
        refresh_url: `${origin}/?org_stripe=refresh`,
        return_url: `${origin}/?org_stripe=complete`,
      });

      return { url: link.url, accountId };
    }
  );
};

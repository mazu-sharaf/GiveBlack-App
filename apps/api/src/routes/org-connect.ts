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

function appDeepLinkUrl(input: { state: "refresh" | "complete" }): string {
  // Matches app.json -> expo.scheme = "giveblack"
  return `giveblack://org-stripe?state=${encodeURIComponent(input.state)}`;
}

export const orgConnectRoutes: FastifyPluginAsync = async (app) => {
  // Public endpoint Stripe returns to (must be https). It then deep-links into the app.
  app.get("/api/org/connect/stripe-redirect", async (request, reply) => {
    const q = request.query as { state?: string };
    const state = q.state === "refresh" ? "refresh" : "complete";
    const deepLink = appDeepLinkUrl({ state });
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Returning to GiveBlack…</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#0d0d0d;color:#fff;margin:0;padding:32px}
    .card{max-width:520px;margin:0 auto;background:#111;border:1px solid #222;border-radius:16px;padding:22px}
    a{color:#34d399;text-decoration:none;font-weight:600}
    .muted{color:#b3b3b3;font-size:14px;line-height:1.6}
  </style>
  <script>
    (function(){
      var url = ${JSON.stringify(deepLink)};
      window.location.href = url;
      setTimeout(function(){ window.location.href = url; }, 900);
    })();
  </script>
</head>
<body>
  <div class="card">
    <h2 style="margin:0 0 8px 0;font-size:20px;">Returning to GiveBlack…</h2>
    <p class="muted" style="margin:0 0 14px 0;">If the app doesn’t open automatically, tap the button below.</p>
    <p style="margin:0;"><a href="${deepLink}">Open GiveBlack</a></p>
  </div>
</body>
</html>`;
    reply.header("Content-Type", "text/html; charset=utf-8");
    return reply.send(html);
  });

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
    "/api/org/connect/sync",
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
        "select id, stripe_account_id from organizations where id = $1 limit 1",
        [resolved.id]
      );
      const row = orgRes.rows[0] as { id: string; stripe_account_id?: string | null } | undefined;
      if (!row?.stripe_account_id) return reply.code(400).send({ error: "Organization is not connected to Stripe yet." });

      const stripe = getStripe();
      const account = await stripe.accounts.retrieve(row.stripe_account_id);
      const payoutsEnabled = Boolean((account as any).payouts_enabled);
      await db.query("update organizations set payouts_enabled = $1 where id = $2", [payoutsEnabled, row.id]);

      return { connected: true, payouts_enabled: payoutsEnabled };
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
        refresh_url: `${origin}/api/org/connect/stripe-redirect?state=refresh`,
        return_url: `${origin}/api/org/connect/stripe-redirect?state=complete`,
      });

      return { url: link.url, accountId };
    }
  );
};

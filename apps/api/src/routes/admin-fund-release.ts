import type { FastifyPluginAsync } from "fastify";
import { db } from "../lib/db.js";
import { env } from "../config/env.js";
import { getStripe } from "../services/stripe.js";

export const adminFundReleaseRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = [app.authenticate, app.requireRole("admin", "super_admin")];

  app.get(
    "/api/admin/fund-release/summary",
    { preHandler: adminOnly },
    async (_request, reply) => {
      const result = await db.query(
        `select
           o.id as org_id,
           o.name as org_name,
           o.stripe_account_id,
           o.payouts_enabled,
           coalesce((
             select os.tier from org_subscriptions os
             where os.org_id = o.id and os.canceled_at is null
             order by os.updated_at desc nulls last
             limit 1
           ), 'free') as plan_tier,
           coalesce(sum(case
             when d.payout_transfer_status = 'in_hold'
              and d.payout_release_at is not null
              and now() < d.payout_release_at
             then d.net_amount_cents else 0 end), 0)::bigint as pending_cents,
           coalesce(sum(case
             when d.payout_transfer_status = 'in_hold'
              and d.payout_release_at is not null
              and now() >= d.payout_release_at
             then d.net_amount_cents else 0 end), 0)::bigint as eligible_cents
         from organizations o
         left join donations d
           on d.org_id = o.id
          and d.status = 'succeeded'
          and d.payout_transfer_status = 'in_hold'
         group by o.id, o.name, o.stripe_account_id, o.payouts_enabled
         order by o.name asc`
      );

      const rows = result.rows as Array<{
        org_id: string;
        org_name: string;
        stripe_account_id: string | null;
        payouts_enabled: boolean;
        plan_tier: string;
        pending_cents: string | bigint;
        eligible_cents: string | bigint;
      }>;

      return {
        organizations: rows.map((r) => {
          const pending = Number(r.pending_cents);
          const eligible = Number(r.eligible_cents);
          return {
            org_id: r.org_id,
            org_name: r.org_name,
            stripe_account_id: r.stripe_account_id,
            payouts_enabled: r.payouts_enabled,
            plan_tier: r.plan_tier,
            pending_cents: pending,
            eligible_cents: eligible,
            total_hold_cents: pending + eligible,
          };
        }),
      };
    }
  );

  app.post(
    "/api/admin/fund-release/:orgId",
    { preHandler: adminOnly },
    async (request, reply) => {
      if (!env.STRIPE_SECRET_KEY) {
        return reply.code(503).send({ error: "Stripe not configured" });
      }
      const { orgId } = request.params as { orgId: string };
      const stripe = getStripe();

      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const orgRes = await client.query(
          "select id, stripe_account_id, payouts_enabled from organizations where id = $1 for update",
          [orgId]
        );
        const org = orgRes.rows[0] as
          | { id: string; stripe_account_id: string | null; payouts_enabled: boolean }
          | undefined;
        if (!org) {
          await client.query("ROLLBACK");
          return reply.code(404).send({ error: "Organization not found" });
        }
        if (!org.stripe_account_id) {
          await client.query("ROLLBACK");
          return reply.code(400).send({ error: "Organization has no Stripe Connect account" });
        }
        if (!org.payouts_enabled) {
          await client.query("ROLLBACK");
          return reply.code(400).send({ error: "Stripe payouts are not enabled for this organization" });
        }

        const donRes = await client.query(
          `select id, net_amount_cents from donations
           where org_id = $1
             and status = 'succeeded'
             and payout_transfer_status = 'in_hold'
             and payout_release_at is not null
             and now() >= payout_release_at
           for update`,
          [orgId]
        );

        const donations = donRes.rows as Array<{ id: string; net_amount_cents: string | number | null }>;
        let totalCents = 0;
        const ids: string[] = [];
        for (const d of donations) {
          const cents = Number(d.net_amount_cents ?? 0);
          if (cents > 0) {
            totalCents += cents;
            ids.push(d.id);
          }
        }

        if (totalCents <= 0 || ids.length === 0) {
          await client.query("ROLLBACK");
          return reply.code(400).send({ error: "No eligible balance to release" });
        }

        const transfer = await stripe.transfers.create({
          amount: totalCents,
          currency: "usd",
          destination: org.stripe_account_id,
          metadata: { org_id: orgId, donation_count: String(ids.length) },
        });

        await client.query(
          `update donations
           set payout_transfer_status = 'released',
               stripe_transfer_id = $2
           where id = any($1::uuid[])`,
          [ids, transfer.id]
        );

        await client.query("COMMIT");

        return {
          success: true,
          transfer_id: transfer.id,
          amount_cents: totalCents,
          donation_count: ids.length,
        };
      } catch (e: unknown) {
        await client.query("ROLLBACK");
        const msg = e instanceof Error ? e.message : "Release failed";
        request.log.error({ err: e }, "admin fund release");
        return reply.code(500).send({ error: msg });
      } finally {
        client.release();
      }
    }
  );
};

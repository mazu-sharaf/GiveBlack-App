import type { FastifyPluginAsync } from "fastify";
import { db } from "../lib/db.js";
import { env } from "../config/env.js";
import { getStripe } from "../services/stripe.js";
import { transferInHoldDonationsForOrg } from "../lib/org-connect-release.js";

export const adminFundReleaseRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = [app.authenticate, app.requireRole("admin", "super_admin")];
  const orgMetricsReaders = [app.authenticate, app.requireRole("admin", "super_admin", "manager", "staff")];

  app.get(
    "/api/admin/organization-fund-metrics",
    { preHandler: orgMetricsReaders },
    async () => {
      const result = await db.query(
        `select o.id as org_id,
           coalesce((
             select sum(d.amount::numeric)
             from donations d
             left join campaigns c on c.id = d.campaign_id
             where d.status = 'succeeded'
               and coalesce(d.org_id, c.organization_id) = o.id
           ), 0)::numeric as raised_from_donations,
           coalesce((
             select sum(coalesce(d.net_amount_cents, 0))
             from donations d
             left join campaigns c on c.id = d.campaign_id
             where d.status = 'succeeded'
               and d.payout_transfer_status = 'in_hold'
               and coalesce(d.org_id, c.organization_id) = o.id
           ), 0)::bigint as on_hold_cents
         from organizations o`
      );
      const rows = result.rows as Array<{
        org_id: string;
        raised_from_donations: string | number;
        on_hold_cents: string | bigint;
      }>;
      return {
        metrics: rows.map((r) => ({
          org_id: r.org_id,
          raised_from_donations: Number(r.raised_from_donations),
          on_hold_cents: Number(r.on_hold_cents),
        })),
      };
    }
  );

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
             when d.id is not null
              and (d.payout_release_at is null or now() < d.payout_release_at)
             then coalesce(d.net_amount_cents, 0) else 0 end), 0)::bigint as pending_cents,
           coalesce(sum(case
             when d.id is not null
              and d.payout_release_at is not null
              and now() >= d.payout_release_at
             then coalesce(d.net_amount_cents, 0) else 0 end), 0)::bigint as eligible_cents
         from organizations o
         left join donations d
           on d.status = 'succeeded'
          and d.payout_transfer_status = 'in_hold'
          and coalesce(d.net_amount_cents, 0) > 0
          and coalesce(
            d.org_id,
            (select c.organization_id from campaigns c where c.id = d.campaign_id limit 1)
          ) = o.id
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
        const result = await transferInHoldDonationsForOrg(client, stripe, orgId, "all_in_hold");
        if (!result.ok) {
          await client.query("ROLLBACK");
          return reply.code(result.statusCode).send({ error: result.error });
        }
        await client.query("COMMIT");
        return {
          success: true,
          transfer_id: result.transfer_id,
          amount_cents: result.amount_cents,
          donation_count: result.donation_count,
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

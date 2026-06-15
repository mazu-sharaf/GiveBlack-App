import type { PoolClient } from "pg";
import { db } from "./db.js";

/** Stripe-like platform fee: 2.9% + $0.30 per charge (cents). Fallback when slices not stored. */
export function platformFeeCents(grossCents: number): number {
  return Math.round(grossCents * 0.029 + 30);
}

export function netToOrgCentsFromGrossCents(grossCents: number): number {
  return Math.max(0, grossCents - platformFeeCents(grossCents));
}

export async function getOrgHoldDays(orgId: string): Promise<number> {
  const r = await db.query(
    `select tier from org_subscriptions
     where org_id = $1 and canceled_at is null
     order by updated_at desc nulls last
     limit 1`,
    [orgId]
  );
  const tier = String((r.rows[0] as { tier?: string } | undefined)?.tier || "free").toLowerCase();
  if (tier === "free") return 14;
  return 7;
}

/**
 * Mark donation paid and attach platform-hold payout metadata (Connect transfer is manual later).
 * Uses precomputed net_amount_cents from checkout when present (UI fee breakdown model).
 */
export async function markDonationSucceededWithPayout(
  client: PoolClient,
  stripePaymentIntentId: string,
  grossCents: number
) {
  const existing = await client.query(
    `select net_amount_cents, fund_slice_net_cents, fund_code_org_id, org_id, campaign_id
     from donations where stripe_payment_intent_id = $1`,
    [stripePaymentIntentId]
  );
  const row = existing.rows[0] as
    | {
        net_amount_cents: string | number | null;
        fund_slice_net_cents: string | number | null;
        fund_code_org_id: string | null;
        org_id: string | null;
        campaign_id: string | null;
      }
    | undefined;

  const net =
    row?.net_amount_cents != null && Number(row.net_amount_cents) >= 0
      ? Number(row.net_amount_cents)
      : netToOrgCentsFromGrossCents(grossCents);

  const fundSliceCents =
    row?.fund_slice_net_cents != null && Number(row.fund_slice_net_cents) > 0
      ? Number(row.fund_slice_net_cents)
      : 0;

  return client.query(
    `update donations d
     set
       status = 'succeeded',
       paid_at = now(),
       net_amount_cents = coalesce(d.net_amount_cents, $2),
       org_id = coalesce(
         d.org_id,
         (select c.organization_id from campaigns c where c.id = d.campaign_id limit 1)
       ),
       payout_transfer_status = case
         when coalesce(
           d.org_id,
           (select c2.organization_id from campaigns c2 where c2.id = d.campaign_id limit 1)
         ) is not null
         and coalesce(d.net_amount_cents, $2) > 0
         then 'in_hold'
         else d.payout_transfer_status
       end,
       fund_slice_transfer_status = case
         when d.fund_code_org_id is not null
           and coalesce(d.fund_slice_net_cents, 0) > 0
           and d.fund_code_org_id is distinct from coalesce(
             d.org_id,
             (select c5.organization_id from campaigns c5 where c5.id = d.campaign_id limit 1)
           )
         then 'in_hold'
         when coalesce(d.fund_slice_net_cents, 0) > 0
           and d.fund_code_org_id is not distinct from coalesce(
             d.org_id,
             (select c6.organization_id from campaigns c6 where c6.id = d.campaign_id limit 1)
           )
         then 'released'
         else coalesce(nullif(d.fund_slice_transfer_status, 'pending'), d.fund_slice_transfer_status, 'legacy')
       end,
       payout_release_at = case
         when coalesce(
           d.org_id,
           (select c3.organization_id from campaigns c3 where c3.id = d.campaign_id limit 1)
         ) is not null
         and (coalesce(d.net_amount_cents, $2) > 0 or coalesce(d.fund_slice_net_cents, 0) > 0)
         then now() + make_interval(days => coalesce((
           select case when lower(coalesce(os.tier, 'free')) = 'free' then 14 else 7 end
           from org_subscriptions os
           where os.org_id = coalesce(
             d.org_id,
             (select c4.organization_id from campaigns c4 where c4.id = d.campaign_id limit 1)
           )
             and os.canceled_at is null
           order by os.updated_at desc nulls last
           limit 1
         ), 14)::int)
         else d.payout_release_at
       end
     where d.stripe_payment_intent_id = $1 and d.status != 'succeeded'
     returning d.id, d.campaign_id, d.amount, d.org_id, d.fund_code_org_id, d.fund_slice_net_cents`,
    [stripePaymentIntentId, net]
  );
}

/**
 * Fix succeeded donations that never got Connect hold metadata (e.g. org_id was null before payout logic).
 */
export async function repairSucceededDonationsLegacyHold(client: PoolClient): Promise<number> {
  const res = await client.query(
    `with resolved as (
       select d.id,
              coalesce(
                d.org_id,
                (select camp.organization_id from campaigns camp where camp.id = d.campaign_id limit 1)
              ) as resolved_org_id
       from donations d
       where d.status = 'succeeded'
         and d.payout_transfer_status = 'legacy'
         and d.stripe_transfer_id is null
         and coalesce(
           d.org_id,
           (select camp.organization_id from campaigns camp where camp.id = d.campaign_id limit 1)
         ) is not null
     )
     update donations d
     set org_id = r.resolved_org_id,
         payout_transfer_status = 'in_hold',
         payout_release_at = now() + make_interval(days => coalesce((
           select case when lower(coalesce(os.tier, 'free')) = 'free' then 14 else 7 end
           from org_subscriptions os
           where os.org_id = r.resolved_org_id and os.canceled_at is null
           order by os.updated_at desc nulls last
           limit 1
         ), 14)::int),
         net_amount_cents = coalesce(
           d.net_amount_cents,
           greatest(
             0,
             floor(d.amount * 100)::bigint
               - round(d.amount::numeric * 100 * 0.029 + 30)::bigint
           )
         )
     from resolved r
     where d.id = r.id`
  );
  return res.rowCount ?? 0;
}

/** Set organizations.raised from succeeded donation gross totals (admin repair / drift fix). */
export async function syncOrganizationRaisedFromSucceededDonations(client: PoolClient): Promise<void> {
  await client.query(
    `update organizations o
     set raised = s.sum_amt
     from (
       select coalesce(d.org_id, c.organization_id) as org_id,
              sum(d.amount)::numeric as sum_amt
       from donations d
       left join campaigns c on c.id = d.campaign_id
       where d.status = 'succeeded'
         and coalesce(d.org_id, c.organization_id) is not null
       group by 1
     ) s
     where o.id = s.org_id`
  );
}

/** One successful donation: increment org raised and donor_count (gross amount matches campaign row updates). */
export async function incrementOrgTotalsFromDonation(
  client: PoolClient,
  orgId: string,
  amount: string | number
): Promise<void> {
  await client.query(
    `update organizations
     set raised = raised + $1::numeric,
         donor_count = donor_count + 1
     where id = $2`,
    [amount, orgId]
  );
}

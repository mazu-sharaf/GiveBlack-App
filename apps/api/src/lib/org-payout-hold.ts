import type { PoolClient } from "pg";
import { db } from "./db.js";

/** Stripe-like platform fee: 2.9% + $0.30 per charge (cents). */
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
 */
export async function markDonationSucceededWithPayout(
  client: PoolClient,
  stripePaymentIntentId: string,
  grossCents: number
) {
  const net = netToOrgCentsFromGrossCents(grossCents);
  return client.query(
    `update donations d
     set
       status = 'succeeded',
       paid_at = now(),
       net_amount_cents = $2,
       org_id = coalesce(
         d.org_id,
         (select c.organization_id from campaigns c where c.id = d.campaign_id limit 1)
       ),
       payout_transfer_status = case
         when coalesce(
           d.org_id,
           (select c.organization_id from campaigns c2 where c2.id = d.campaign_id limit 1)
         ) is not null then 'in_hold'
         else d.payout_transfer_status
       end,
       payout_release_at = case
         when coalesce(
           d.org_id,
           (select c.organization_id from campaigns c3 where c3.id = d.campaign_id limit 1)
         ) is not null
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
     returning d.id, d.campaign_id, d.amount, d.org_id`,
    [stripePaymentIntentId, net]
  );
}

/**
 * Fix succeeded donations that never got Connect hold metadata (e.g. org_id was null before payout logic).
 * Idempotent for rows already in_hold/released with a transfer.
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

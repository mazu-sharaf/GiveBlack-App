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
       payout_transfer_status = case when d.org_id is not null then 'in_hold' else d.payout_transfer_status end,
       payout_release_at = case when d.org_id is not null
         then now() + make_interval(days => coalesce((
           select case when lower(coalesce(os.tier, 'free')) = 'free' then 14 else 7 end
           from org_subscriptions os
           where os.org_id = d.org_id and os.canceled_at is null
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

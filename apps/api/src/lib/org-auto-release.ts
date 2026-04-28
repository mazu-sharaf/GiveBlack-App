import { db } from "./db.js";
import { env } from "../config/env.js";
import { getStripe } from "../services/stripe.js";
import { transferInHoldDonationsForOrg } from "./org-connect-release.js";

/**
 * After the 7/14 day hold, automatically transfer eligible in-hold balances to
 * orgs with Stripe Connect payouts enabled (same transfer as admin release, scoped to past hold).
 */
export async function runAutoReleaseEligibleConnectHolds(): Promise<{
  orgsAttempted: number;
  transfers: number;
  amount_cents: number;
  errors: string[];
}> {
  const errors: string[] = [];
  if (!env.STRIPE_SECRET_KEY) {
    return { orgsAttempted: 0, transfers: 0, amount_cents: 0, errors };
  }

  const stripe = getStripe();
  const orgRes = await db.query<{ id: string }>(
    `select distinct o.id
     from organizations o
     inner join donations d on d.status = 'succeeded'
       and d.payout_transfer_status = 'in_hold'
       and coalesce(d.net_amount_cents, 0) > 0
       and d.payout_release_at is not null
       and now() >= d.payout_release_at
     left join campaigns camp on camp.id = d.campaign_id
     where o.stripe_account_id is not null
       and o.payouts_enabled = true
       and coalesce(d.org_id, camp.organization_id) = o.id`
  );

  let transfers = 0;
  let amount_cents = 0;

  for (const row of orgRes.rows) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await transferInHoldDonationsForOrg(client, stripe, row.id, "eligible_only");
      if (result.ok) {
        await client.query("COMMIT");
        transfers += 1;
        amount_cents += result.amount_cents;
      } else {
        await client.query("ROLLBACK");
        if (result.statusCode !== 400 || !result.error.includes("No funds on hold")) {
          errors.push(`${row.id}: ${result.error}`);
        }
      }
    } catch (e: unknown) {
      await client.query("ROLLBACK").catch(() => {});
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${row.id}: ${msg}`);
    } finally {
      client.release();
    }
  }

  return {
    orgsAttempted: orgRes.rows.length,
    transfers,
    amount_cents,
    errors,
  };
}

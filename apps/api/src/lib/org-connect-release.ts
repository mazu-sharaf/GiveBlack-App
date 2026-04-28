import type { PoolClient } from "pg";
import type Stripe from "stripe";

export type ConnectReleaseMode = "all_in_hold" | "eligible_only";

export type ConnectReleaseResult =
  | { ok: true; transfer_id: string; amount_cents: number; donation_count: number }
  | { ok: false; error: string; statusCode: number };

/**
 * Transfer platform-held net amounts to a Connect destination for one org.
 * - `all_in_hold`: admin early release (any in-hold donation).
 * - `eligible_only`: auto job after payout_release_at (7/14 day hold).
 */
export async function transferInHoldDonationsForOrg(
  client: PoolClient,
  stripe: Stripe,
  orgId: string,
  mode: ConnectReleaseMode
): Promise<ConnectReleaseResult> {
  const orgRes = await client.query(
    "select id, stripe_account_id, payouts_enabled from organizations where id = $1 for update",
    [orgId]
  );
  const org = orgRes.rows[0] as
    | { id: string; stripe_account_id: string | null; payouts_enabled: boolean }
    | undefined;
  if (!org) {
    return { ok: false, error: "Organization not found", statusCode: 404 };
  }
  if (!org.stripe_account_id) {
    return { ok: false, error: "Organization has no Stripe Connect account", statusCode: 400 };
  }
  if (!org.payouts_enabled) {
    return { ok: false, error: "Stripe payouts are not enabled for this organization", statusCode: 400 };
  }

  const eligibleClause =
    mode === "eligible_only"
      ? "and d.payout_release_at is not null and now() >= d.payout_release_at"
      : "";

  const donRes = await client.query(
    `select d.id, d.net_amount_cents from donations d
     left join campaigns camp on camp.id = d.campaign_id
     where d.status = 'succeeded'
       and d.payout_transfer_status = 'in_hold'
       and coalesce(d.net_amount_cents, 0) > 0
       and coalesce(d.org_id, camp.organization_id) = $1
       ${eligibleClause}
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
    return {
      ok: false,
      error: "No funds on hold to release for this organization",
      statusCode: 400,
    };
  }

  const transfer = await stripe.transfers.create({
    amount: totalCents,
    currency: "usd",
    destination: org.stripe_account_id,
    metadata: {
      org_id: orgId,
      donation_count: String(ids.length),
      release_mode: mode,
    },
  });

  await client.query(
    `update donations
     set payout_transfer_status = 'released',
         stripe_transfer_id = $2
     where id = any($1::uuid[])`,
    [ids, transfer.id]
  );

  return {
    ok: true,
    transfer_id: transfer.id,
    amount_cents: totalCents,
    donation_count: ids.length,
  };
}

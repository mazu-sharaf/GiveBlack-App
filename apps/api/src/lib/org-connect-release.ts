import type { PoolClient } from "pg";
import { db } from "./db.js";

export type ConnectReleaseMode = "all_in_hold" | "eligible_only";

export type ConnectReleaseResult =
  | { ok: true; transfer_id: string; amount_cents: number; donation_count: number }
  | { ok: false; error: string; statusCode: number };

/**
 * Transfer platform-held net amounts to a Connect destination for one org.
 * Includes primary org net_amount_cents and fund_slice_net_cents owed to this org.
 */
export async function transferInHoldDonationsForOrg(
  client: PoolClient,
  stripe: import("stripe").default,
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

  const primaryRes = await client.query(
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

  const fundRes = await client.query(
    `select d.id, d.fund_slice_net_cents from donations d
     where d.status = 'succeeded'
       and d.fund_slice_transfer_status = 'in_hold'
       and coalesce(d.fund_slice_net_cents, 0) > 0
       and d.fund_code_org_id = $1
       ${eligibleClause.replace(/payout_release_at/g, "payout_release_at")}
     for update`,
    [orgId]
  );

  const primaryIds = (primaryRes.rows as Array<{ id: string; net_amount_cents: string | number | null }>).map(
    (d) => d.id
  );
  const fundIds = (fundRes.rows as Array<{ id: string; fund_slice_net_cents: string | number | null }>).map(
    (d) => d.id
  );

  let totalCents = 0;
  for (const d of primaryRes.rows as Array<{ net_amount_cents: string | number | null }>) {
    totalCents += Number(d.net_amount_cents ?? 0);
  }
  for (const d of fundRes.rows as Array<{ fund_slice_net_cents: string | number | null }>) {
    totalCents += Number(d.fund_slice_net_cents ?? 0);
  }

  if (totalCents <= 0 || (primaryIds.length === 0 && fundIds.length === 0)) {
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
      primary_donation_count: String(primaryIds.length),
      fund_slice_donation_count: String(fundIds.length),
      release_mode: mode,
    },
  });

  if (primaryIds.length > 0) {
    await client.query(
      `update donations
       set payout_transfer_status = 'released',
           stripe_transfer_id = $2
       where id = any($1::uuid[])`,
      [primaryIds, transfer.id]
    );
  }

  if (fundIds.length > 0) {
    await client.query(
      `update donations
       set fund_slice_transfer_status = 'released',
           fund_slice_stripe_transfer_id = $2
       where id = any($1::uuid[])`,
      [fundIds, transfer.id]
    );
  }

  return {
    ok: true,
    transfer_id: transfer.id,
    amount_cents: totalCents,
    donation_count: primaryIds.length + fundIds.length,
  };
}

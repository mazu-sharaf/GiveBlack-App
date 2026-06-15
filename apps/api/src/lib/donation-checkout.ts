import { computeDonationSlices, type DonationSliceResult } from "./donation-slices.js";
import { resolveFundCode, resolveParticipantId, type ResolvedFundCode } from "./fund-codes.js";

export type DonationCheckoutParams = {
  amount: number;
  orgId: string;
  campaignId?: string | null;
  /** Organizational / education partner code (?code= or ?partner=) */
  fundCode?: string | null;
  reinvestOptIn?: boolean;
  reinvestPct?: number;
  endowmentOptIn?: boolean;
  endowmentPct?: number;
  /** Campaign participant seller code (?seller=) */
  sellerCode?: string | null;
  participantId?: string | null;
};

export type PreparedDonationCheckout = {
  fund: ResolvedFundCode | null;
  slices: DonationSliceResult;
  partnerId: string | null;
  participantId: string | null;
};

export async function prepareDonationCheckout(
  params: DonationCheckoutParams
): Promise<PreparedDonationCheckout> {
  const fund = await resolveFundCode(params.fundCode);

  let participantId = params.participantId?.trim() || null;
  if (!participantId && params.sellerCode && params.campaignId) {
    participantId = await resolveParticipantId(params.campaignId, params.sellerCode);
  }

  const fundCodeOrgId = fund?.organizationId ?? null;

  const slices = computeDonationSlices({
    gross: params.amount,
    reinvestOptIn: params.reinvestOptIn ?? false,
    reinvestPct: params.reinvestPct ?? 5,
    endowmentOptIn: params.endowmentOptIn ?? false,
    endowmentPct: params.endowmentPct ?? 1,
    fundCodeOrgId,
    receivesEducation: fund?.receivesEducation ?? false,
    receivesEndowment: fund?.receivesEndowment ?? false,
    hasLegacyPartner: Boolean(fund && !fund.organizationId),
    primaryOrgId: params.orgId,
  });

  return {
    fund,
    slices,
    partnerId: fund?.partnerId ?? null,
    participantId,
  };
}

/** Stripe PaymentIntent / Checkout metadata for fund slices */
export function fundSliceMetadata(
  prepared: PreparedDonationCheckout,
  opts?: { reinvestPct?: number; endowmentPct?: number }
): Record<string, string> {
  const { slices, partnerId, participantId } = prepared;
  return {
    epId: partnerId || "",
    reinvest: slices.reinvest_amount > 0 ? "1" : "0",
    rAmt: String(slices.reinvest_amount),
    pAmt: String(slices.partner_reinvest_amount),
    gAmt: String(slices.general_reinvest_amount),
    endowment: slices.endowment_amount > 0 ? "1" : "0",
    eAmt: String(slices.endowment_amount),
    peAmt: String(slices.partner_endowment_amount),
    geAmt: String(slices.general_endowment_amount),
    platFee: String(slices.platform_fee_amount),
    netCents: String(slices.net_amount_cents),
    fundOrgId: slices.fund_code_org_id || "",
    fundSliceCents: String(slices.fund_slice_net_cents),
    participantId: participantId || "",
    reinvestPct: String(opts?.reinvestPct ?? 5),
    endowmentPct: String(opts?.endowmentPct ?? 1),
  };
}

export type DonationInsertRow = {
  orgId: string;
  campaignId: string | null;
  userId: string | null;
  donorEmail: string | null;
  donorName: string | null;
  amount: number;
  currency: string;
  status: string;
  stripePaymentIntentId: string;
  prepared: PreparedDonationCheckout;
  reinvestOptIn: boolean;
  endowmentOptIn: boolean;
};

/** Column order for insert into donations (extended financial fields). */
export function donationInsertSql(opts?: { onConflictDoNothing?: boolean }): string {
  const base = `insert into donations (
    org_id, campaign_id, user_id, donor_email, donor_name, amount, currency, status,
    stripe_payment_intent_id, education_partner_id, reinvest_opt_in,
    reinvest_amount, partner_reinvest_amount, general_reinvest_amount,
    endowment_opt_in, endowment_pct, endowment_amount, partner_endowment_amount, general_endowment_amount,
    fund_code_org_id, platform_fee_amount, net_amount_cents,
    fund_slice_net_cents, fund_slice_transfer_status, participant_id
  ) values (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
  )`;
  if (opts?.onConflictDoNothing) {
    return `${base} on conflict (stripe_payment_intent_id) do nothing`;
  }
  return `${base} returning id`;
}

export function donationInsertValues(row: DonationInsertRow, reinvestPct: number, endowmentPct: number) {
  const { slices, partnerId, participantId } = row.prepared;
  const fundSliceStatus =
    slices.fund_slice_net_cents > 0 && slices.fund_code_org_id ? "pending" : "legacy";

  return [
    row.orgId,
    row.campaignId,
    row.userId,
    row.donorEmail,
    row.donorName,
    row.amount,
    row.currency,
    row.status,
    row.stripePaymentIntentId,
    partnerId,
    row.reinvestOptIn,
    slices.reinvest_amount,
    slices.partner_reinvest_amount,
    slices.general_reinvest_amount,
    row.endowmentOptIn,
    endowmentPct,
    slices.endowment_amount,
    slices.partner_endowment_amount,
    slices.general_endowment_amount,
    slices.fund_code_org_id,
    slices.platform_fee_amount,
    slices.net_amount_cents,
    slices.fund_slice_net_cents > 0 ? slices.fund_slice_net_cents : null,
    fundSliceStatus,
    participantId,
  ];
}

/** Build insert values from Stripe Checkout / PI metadata (webhook fallback). */
export function donationInsertFromMetadata(
  md: Record<string, string>,
  opts: {
    orgId: string;
    campaignId: string | null;
    userId: string | null;
    donorEmail: string | null;
    donorName: string | null;
    amount: number;
    currency: string;
    stripePaymentIntentId: string;
  }
) {
  const reinvestOptIn = md.reinvest === "1";
  const endowmentOptIn = md.endowment === "1";
  const epId = md.epId && md.epId.length > 0 ? md.epId : null;
  const fundOrgId = md.fundOrgId && md.fundOrgId.length > 0 ? md.fundOrgId : null;
  const fundSliceCents = Number.parseInt(md.fundSliceCents || "0", 10) || 0;
  const netCents = Number.parseInt(md.netCents || "0", 10) || 0;
  const participantId = md.participantId && md.participantId.length > 0 ? md.participantId : null;
  const reinvestPct = Number.parseFloat(md.reinvestPct || "5") || 5;
  const endowmentPct = Number.parseFloat(md.endowmentPct || "1") || 1;

  const fundSliceStatus =
    fundSliceCents > 0 && fundOrgId ? "pending" : "legacy";

  return [
    opts.orgId,
    opts.campaignId,
    opts.userId,
    opts.donorEmail,
    opts.donorName,
    opts.amount,
    opts.currency,
    "pending",
    opts.stripePaymentIntentId,
    epId,
    reinvestOptIn,
    Number.parseFloat(md.rAmt || "0") || 0,
    Number.parseFloat(md.pAmt || "0") || 0,
    Number.parseFloat(md.gAmt || "0") || 0,
    endowmentOptIn,
    endowmentPct,
    Number.parseFloat(md.eAmt || "0") || 0,
    Number.parseFloat(md.peAmt || "0") || 0,
    Number.parseFloat(md.geAmt || "0") || 0,
    fundOrgId,
    Number.parseFloat(md.platFee || "0") || 0,
    netCents > 0 ? netCents : null,
    fundSliceCents > 0 ? fundSliceCents : null,
    fundSliceStatus,
    participantId,
  ];
}

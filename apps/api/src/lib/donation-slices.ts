/** Donation fee breakdown aligned with mobile donate UI (3% platform, optional education/endowment). */

import { roundMoney } from "./education-reinvest.js";

export const PLATFORM_FEE_RATE = 0.03;

export type DonationSliceInput = {
  gross: number;
  reinvestOptIn: boolean;
  reinvestPct: number;
  endowmentOptIn: boolean;
  endowmentPct: number;
  /** Org linked to organizational / partner code */
  fundCodeOrgId: string | null;
  receivesEducation: boolean;
  receivesEndowment: boolean;
  /** Legacy education partner without organization_id */
  hasLegacyPartner: boolean;
  /** Primary donation recipient org */
  primaryOrgId: string;
};

export type DonationSliceResult = {
  platform_fee_amount: number;
  reinvest_amount: number;
  partner_reinvest_amount: number;
  general_reinvest_amount: number;
  endowment_amount: number;
  partner_endowment_amount: number;
  general_endowment_amount: number;
  primary_net_amount: number;
  fund_slice_amount: number;
  net_amount_cents: number;
  fund_slice_net_cents: number;
  fund_code_org_id: string | null;
};

export function computeDonationSlices(input: DonationSliceInput): DonationSliceResult {
  const platform_fee_amount = roundMoney(input.gross * PLATFORM_FEE_RATE);

  const reinvest_amount =
    input.reinvestOptIn && input.reinvestPct > 0
      ? roundMoney(input.gross * (input.reinvestPct / 100))
      : 0;

  const endowment_amount =
    input.endowmentOptIn && input.endowmentPct > 0
      ? roundMoney(input.gross * (input.endowmentPct / 100))
      : 0;

  let partner_reinvest_amount = 0;
  let general_reinvest_amount = 0;
  if (reinvest_amount > 0) {
    if (input.fundCodeOrgId && input.receivesEducation) {
      partner_reinvest_amount = reinvest_amount;
    } else if (input.hasLegacyPartner) {
      partner_reinvest_amount = reinvest_amount;
    } else {
      general_reinvest_amount = reinvest_amount;
    }
  }

  let partner_endowment_amount = 0;
  let general_endowment_amount = 0;
  if (endowment_amount > 0) {
    if (input.fundCodeOrgId && input.receivesEndowment) {
      partner_endowment_amount = endowment_amount;
    } else {
      general_endowment_amount = endowment_amount;
    }
  }

  const primary_net_amount = roundMoney(
    input.gross - platform_fee_amount - reinvest_amount - endowment_amount
  );

  let fund_slice_amount = roundMoney(partner_reinvest_amount + partner_endowment_amount);
  let net_amount_cents = Math.max(0, Math.round(primary_net_amount * 100));
  let fund_slice_net_cents = Math.max(0, Math.round(fund_slice_amount * 100));
  const fund_code_org_id = input.fundCodeOrgId;

  // Same org receives primary + fund slices in one transfer
  if (
    fund_code_org_id &&
    fund_code_org_id === input.primaryOrgId &&
    fund_slice_net_cents > 0
  ) {
    net_amount_cents += fund_slice_net_cents;
    fund_slice_net_cents = 0;
    fund_slice_amount = 0;
  }

  return {
    platform_fee_amount,
    reinvest_amount,
    partner_reinvest_amount,
    general_reinvest_amount,
    endowment_amount,
    partner_endowment_amount,
    general_endowment_amount,
    primary_net_amount,
    fund_slice_amount,
    net_amount_cents,
    fund_slice_net_cents,
    fund_code_org_id,
  };
}

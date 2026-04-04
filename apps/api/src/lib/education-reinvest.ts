/** Reinvest slice allocation: 100% to partner when resolved, else 100% to general fund. */

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeReinvestAllocation(
  grossAmount: number,
  reinvestOptIn: boolean,
  reinvestPct: number,
  partnerId: string | null
): {
  reinvest_amount: number;
  partner_reinvest_amount: number;
  general_reinvest_amount: number;
} {
  const reinvest_amount =
    reinvestOptIn && reinvestPct > 0 ? roundMoney(grossAmount * (reinvestPct / 100)) : 0;
  if (reinvest_amount <= 0) {
    return { reinvest_amount: 0, partner_reinvest_amount: 0, general_reinvest_amount: 0 };
  }
  if (partnerId) {
    return {
      reinvest_amount,
      partner_reinvest_amount: reinvest_amount,
      general_reinvest_amount: 0,
    };
  }
  return {
    reinvest_amount,
    partner_reinvest_amount: 0,
    general_reinvest_amount: reinvest_amount,
  };
}

/**
 * Donation fee split calculator
 *
 * Default splits:
 *  - Platform fee: 3% (fixed)
 *  - Reinvest in Black Education: 5% (adjustable, optional)
 *  - Education Endowment: 1% (adjustable 1-2%, optional)
 *  - Processing fee: estimated 2.9% + $0.30 (Stripe standard)
 *  - Organization payout: remainder
 */

export interface SplitConfig {
  /** Gross donation amount */
  amount: number;
  /** Whether donor opted in to reinvest */
  reinvestOptedIn: boolean;
  /** Reinvest percentage (default 5) */
  reinvestPct: number;
  /** Whether donor opted in to endowment */
  endowmentOptedIn: boolean;
  /** Endowment percentage (default 1) */
  endowmentPct: number;
  /** Whether org absorbs fees (true = org pays, false = donor pays on top) */
  orgAbsorbsFees: boolean;
}

export interface DonationSplit {
  splitType: string;
  amount: number;
  percentage: number;
}

export interface SplitResult {
  splits: DonationSplit[];
  totalCharged: number; // what the donor is charged
  orgPayout: number;
}

const PLATFORM_FEE_PCT = 3;
const PROCESSING_FEE_PCT = 2.9;
const PROCESSING_FEE_FIXED = 0.30;

export function calculateSplits(config: SplitConfig): SplitResult {
  const { amount, reinvestOptedIn, reinvestPct, endowmentOptedIn, endowmentPct, orgAbsorbsFees } = config;

  const platformFee = round(amount * (PLATFORM_FEE_PCT / 100));
  const reinvestAmount = reinvestOptedIn ? round(amount * (reinvestPct / 100)) : 0;
  const endowmentAmount = endowmentOptedIn ? round(amount * (endowmentPct / 100)) : 0;
  const processingFee = round(amount * (PROCESSING_FEE_PCT / 100) + PROCESSING_FEE_FIXED);

  const totalFees = platformFee + reinvestAmount + endowmentAmount + processingFee;

  let orgPayout: number;
  let totalCharged: number;

  if (orgAbsorbsFees) {
    // Org absorbs: donor pays "amount", org gets less
    totalCharged = amount;
    orgPayout = round(amount - totalFees);
  } else {
    // Donor pays fees on top
    totalCharged = round(amount + totalFees);
    orgPayout = amount;
  }

  const splits: DonationSplit[] = [
    { splitType: "organization", amount: orgPayout, percentage: round((orgPayout / totalCharged) * 100) },
    { splitType: "platform_fee", amount: platformFee, percentage: PLATFORM_FEE_PCT },
    { splitType: "processing", amount: processingFee, percentage: round((processingFee / totalCharged) * 100) },
  ];

  if (reinvestOptedIn && reinvestAmount > 0) {
    splits.push({ splitType: "reinvest", amount: reinvestAmount, percentage: reinvestPct });
  }
  if (endowmentOptedIn && endowmentAmount > 0) {
    splits.push({ splitType: "endowment", amount: endowmentAmount, percentage: endowmentPct });
  }

  return { splits, totalCharged, orgPayout };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Human-readable labels for split types */
export const SPLIT_LABELS: Record<string, string> = {
  organization: "To Organization",
  platform_fee: "GiveBlack Platform Fee",
  processing: "Payment Processing",
  reinvest: "Reinvest in Black Education",
  endowment: "Education Endowment",
};

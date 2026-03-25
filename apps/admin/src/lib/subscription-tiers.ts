export type TierKey = "free" | "growth" | "institutional";

type TierConfig = {
  /** Human readable tier name */
  name: string;
  /** Monthly price in USD */
  price: number;
  /** Stripe product id (for mapping webhooks) */
  product_id: string | null;
  /** Stripe price id used when creating checkout sessions */
  price_id: string | null;
  /** Bullet list of features shown in the UI */
  features: string[];
};

/**
 * Subscription tiers used by the admin panel.
 *
 * NOTE: product_id and price_id values should match the Stripe dashboard setup
 * you already use for Growth and Institutional plans. If you ever change them
 * in Stripe, update them here to keep the mapping correct.
 */
export const SUBSCRIPTION_TIERS: Record<TierKey, TierConfig> = {
  free: {
    name: "Free",
    price: 0,
    product_id: null,
    price_id: null,
    features: [
      "1 community campaign",
      "Up to $5,000 goal per campaign",
      "Standard support",
    ],
  },
  growth: {
    name: "Growth",
    price: 99,
    // GiveBlack Growth - prod_U8Iotu17CesgKO
    product_id: "prod_U8Iotu17CesgKO",
    // Price for GiveBlack Growth - price_1TA2CPBk2z7Pp8h03aNgWKxt
    price_id: "price_1TA2CPBk2z7Pp8h03aNgWKxt",
    features: [
      "5 community campaigns",
      "Up to $50,000 goal per campaign",
      "Volunteer signup",
      "Everything in Free",
      "Priority support",
    ],
  },
  institutional: {
    name: "Institutional",
    price: 249,
    // GiveBlack Institutional - prod_U8IpZXR2R0SNHb
    product_id: "prod_U8IpZXR2R0SNHb",
    // Price for GiveBlack Institutional - price_1TA2DnBk2z7Pp8h0GFcDMfQ3
    price_id: "price_1TA2DnBk2z7Pp8h0GFcDMfQ3",
    features: [
      "Unlimited community campaigns",
      "Unlimited goal per campaign",
      "Volunteer signup",
      "Everything in Growth",
      "Dedicated support",
    ],
  },
};

const PRODUCT_ID_TO_TIER: Record<string, TierKey> = {
  prod_U8Iotu17CesgKO: "growth",
  prod_U8IpZXR2R0SNHb: "institutional",
};

/**
 * Map a Stripe product id to a tier key.
 * Falls back to \"free\" when unknown.
 */
export function getTierByProductId(productId: string | null | undefined): TierKey {
  if (!productId) return "free";
  return PRODUCT_ID_TO_TIER[productId] ?? "free";
}


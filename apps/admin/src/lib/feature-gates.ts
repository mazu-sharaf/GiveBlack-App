import { SUBSCRIPTION_TIERS, type TierKey } from "./subscription-tiers";

/**
 * Feature keys that can be gated by subscription tier.
 */
export type Feature =
  | "analytics_dashboard"
  | "csv_export"
  | "custom_branding"
  | "donor_retention"
  | "category_breakdown"
  | "advanced_reports"
  | "api_access"
  | "multi_campaign"
  | "email_tools"
  | "custom_integrations";

/**
 * Minimum tier required for each feature.
 * "free" = available to all, "growth" = Growth+, "institutional" = Institutional only.
 */
const FEATURE_TIERS: Record<Feature, TierKey> = {
  analytics_dashboard: "growth",
  csv_export: "growth",
  custom_branding: "growth",
  donor_retention: "growth",
  category_breakdown: "growth",
  email_tools: "growth",
  advanced_reports: "institutional",
  api_access: "institutional",
  multi_campaign: "institutional",
  custom_integrations: "institutional",
};

const TIER_RANK: Record<TierKey, number> = {
  free: 0,
  growth: 1,
  institutional: 2,
};

/** Human-readable feature labels */
export const FEATURE_LABELS: Record<Feature, string> = {
  analytics_dashboard: "Analytics Dashboard",
  csv_export: "CSV Export",
  custom_branding: "Custom Branding",
  donor_retention: "Donor Retention Charts",
  category_breakdown: "Category Breakdown",
  email_tools: "Email Campaign Tools",
  advanced_reports: "Advanced Reports & Exports",
  api_access: "API Access",
  multi_campaign: "Multi-Campaign Management",
  custom_integrations: "Custom Integrations",
};

/** Check if a tier has access to a feature */
export function hasFeature(currentTier: TierKey, feature: Feature): boolean {
  return TIER_RANK[currentTier] >= TIER_RANK[FEATURE_TIERS[feature]];
}

/** Get the minimum tier required for a feature */
export function requiredTier(feature: Feature): TierKey {
  return FEATURE_TIERS[feature];
}

/** Get all features available on a given tier */
export function getFeaturesForTier(tier: TierKey): Feature[] {
  return (Object.keys(FEATURE_TIERS) as Feature[]).filter(
    (f) => TIER_RANK[tier] >= TIER_RANK[FEATURE_TIERS[f]]
  );
}

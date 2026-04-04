/** Subscription tier limits (aligned with org/community campaign UX). */
export const TIER_LIMITS: Record<string, { max_community_campaigns: number; max_goal_per_campaign: number }> = {
  free: { max_community_campaigns: 1, max_goal_per_campaign: 5000 },
  growth: { max_community_campaigns: 5, max_goal_per_campaign: 50000 },
  institutional: { max_community_campaigns: 999999, max_goal_per_campaign: 999999999 },
};

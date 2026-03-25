import { useState, useEffect, useCallback } from "react";
import { invokeFunction } from "@/lib/api";
import { getTierByProductId, type TierKey } from "@/lib/subscription-tiers";
import { hasFeature, type Feature } from "@/lib/feature-gates";

interface SubscriptionData {
  subscribed?: boolean;
  product_id?: string;
  tier?: string;
  status?: string;
}

export function useSubscriptionTier() {
  const [tier, setTier] = useState<TierKey>("free");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await invokeFunction<SubscriptionData>("check-subscription");
      if (data?.subscribed && data?.product_id) {
        setTier(getTierByProductId(data.product_id));
      } else {
        setTier("free");
      }
    } catch {
      setTier("free");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const can = useCallback(
    (feature: Feature) => hasFeature(tier, feature),
    [tier]
  );

  return { tier, loading, can, refresh };
}

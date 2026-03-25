import { useState, useEffect, useCallback } from "react";
import { hasApiConfig, getOrgFeatures } from "@/lib/api";
import { hasFeature, type Feature } from "@/lib/feature-gates";
import type { TierKey } from "@/lib/subscription-tiers";

export function useOrgSubscription(orgId: string | null) {
  const [tier, setTier] = useState<TierKey>("free");
  const [status, setStatus] = useState<string>("active");
  const [features, setFeatures] = useState<string[]>([]);
  const [loading, setLoading] = useState(!!orgId);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setTier("free");
      setStatus("active");
      setFeatures([]);
      setLoading(false);
      return;
    }
    if (!hasApiConfig()) {
      setTier("free");
      setStatus("active");
      setFeatures([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getOrgFeatures(orgId);
      setTier((data.tier as TierKey) || "free");
      setStatus(data.status || "active");
      setFeatures(data.features || []);
    } catch {
      setTier("free");
      setStatus("active");
      setFeatures([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const can = useCallback(
    (feature: Feature) => hasFeature(tier, feature),
    [tier]
  );

  return { tier, status, features, loading, can, refresh };
}

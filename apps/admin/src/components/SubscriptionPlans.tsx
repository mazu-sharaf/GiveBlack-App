import { useState } from "react";
import { invokeFunction } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SUBSCRIPTION_TIERS, type TierKey } from "@/lib/subscription-tiers";
import { Check, Zap, Building2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

const TIER_ICONS: Record<TierKey, LucideIcon> = {
  free: Check,
  growth: Zap,
  institutional: Building2,
};

interface Props {
  currentTier?: TierKey;
  onSubscribed?: () => void;
}

export function SubscriptionPlans({ currentTier = "free", onSubscribed }: Props) {
  const [loading, setLoading] = useState<TierKey | null>(null);

  const handleSubscribe = async (tier: TierKey) => {
    const priceId = SUBSCRIPTION_TIERS[tier].price_id;
    if (!priceId) return;

    setLoading(tier);
    try {
      const data = await invokeFunction<{ url?: string }>("create-checkout", { priceId });
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start checkout");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {(Object.entries(SUBSCRIPTION_TIERS) as [TierKey, typeof SUBSCRIPTION_TIERS[TierKey]][]).map(([key, tier]) => {
        const isCurrent = key === currentTier;
        const Icon = TIER_ICONS[key];

        return (
          <Card key={key} className={`relative ${isCurrent ? "border-primary ring-2 ring-primary/20" : ""}`}>
            {isCurrent && (
              <Badge className="absolute -top-2.5 left-4 bg-primary text-primary-foreground">Current Plan</Badge>
            )}
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">{tier.name}</CardTitle>
              </div>
              <div className="pt-2">
                <span className="text-3xl font-bold">${tier.price}</span>
                {tier.price > 0 && <span className="text-muted-foreground text-sm">/month</span>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {key === "free" ? (
                <Button variant="outline" disabled className="w-full">
                  {isCurrent ? "Active" : "Default"}
                </Button>
              ) : (
                <Button
                  className="w-full"
                  variant={isCurrent ? "outline" : "default"}
                  disabled={isCurrent || loading === key}
                  onClick={() => handleSubscribe(key)}
                >
                  {loading === key ? "Redirecting..." : isCurrent ? "Active" : `Subscribe ($${tier.price}/mo)`}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

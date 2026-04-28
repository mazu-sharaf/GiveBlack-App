import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, ArrowRight } from "lucide-react";
import { requiredTier, FEATURE_LABELS, type Feature } from "@/lib/feature-gates";
import { SUBSCRIPTION_TIERS } from "@/lib/subscription-tiers";
import type { TierKey } from "@/lib/subscription-tiers";

interface Props {
  feature: Feature;
  currentTier: TierKey;
  /** If true, renders as a full-page overlay instead of inline card */
  overlay?: boolean;
  children?: React.ReactNode;
}

export function UpgradeGate({ feature, currentTier, overlay = false, children }: Props) {
  const navigate = useNavigate();
  const needed = requiredTier(feature);
  const tierInfo = SUBSCRIPTION_TIERS[needed];

  const content = (
    <Card className="border-dashed border-2 border-muted">
      <CardContent className="flex flex-col items-center justify-center py-10 text-center space-y-3">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">{FEATURE_LABELS[feature]}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            This feature requires the{" "}
            <Badge variant="secondary" className="mx-1">{tierInfo.name}</Badge>
            plan or higher.
          </p>
        </div>
        <p className="text-xs text-muted-foreground max-w-md">
          Upgrade to unlock {FEATURE_LABELS[feature].toLowerCase()} and other powerful tools
          to grow your organization's impact.
        </p>
        <Button onClick={() => navigate("/subscriptions")} className="mt-2">
          <ArrowRight className="h-4 w-4 mr-1" /> Upgrade to {tierInfo.name} (${tierInfo.price}/mo)
        </Button>
      </CardContent>
    </Card>
  );

  if (overlay) {
    return (
      <div className="relative">
        <div className="opacity-20 pointer-events-none select-none blur-[2px]">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center p-4">
          {content}
        </div>
      </div>
    );
  }

  return content;
}

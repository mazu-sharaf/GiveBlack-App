import { useState } from "react";
import { calculateSplits, SPLIT_LABELS, type SplitConfig } from "@/lib/donation-splits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";

interface Props {
  amount: number;
  orgAbsorbsFees?: boolean;
  showControls?: boolean;
}

const SPLIT_COLORS: Record<string, string> = {
  organization: "bg-primary",
  platform_fee: "bg-accent",
  processing: "bg-muted-foreground",
  reinvest: "bg-chart-4",
  endowment: "bg-chart-5",
};

export function DonationSplitPreview({ amount, orgAbsorbsFees = false, showControls = true }: Props) {
  const [reinvestOptedIn, setReinvestOptedIn] = useState(true);
  const [reinvestPct, setReinvestPct] = useState(5);
  const [endowmentOptedIn, setEndowmentOptedIn] = useState(true);
  const [endowmentPct, setEndowmentPct] = useState(1);

  const config: SplitConfig = {
    amount,
    reinvestOptedIn,
    reinvestPct,
    endowmentOptedIn,
    endowmentPct,
    orgAbsorbsFees,
  };

  const result = calculateSplits(config);

  if (amount <= 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">Donation Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {showControls && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Reinvest in Black Education</Label>
                <p className="text-xs text-muted-foreground">{reinvestPct}% of donation</p>
              </div>
              <Switch checked={reinvestOptedIn} onCheckedChange={setReinvestOptedIn} />
            </div>
            {reinvestOptedIn && (
              <Slider
                value={[reinvestPct]}
                onValueChange={([v]) => setReinvestPct(v)}
                min={1}
                max={15}
                step={1}
                className="w-full"
              />
            )}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Education Endowment</Label>
                <p className="text-xs text-muted-foreground">{endowmentPct}% of donation</p>
              </div>
              <Switch checked={endowmentOptedIn} onCheckedChange={setEndowmentOptedIn} />
            </div>
            {endowmentOptedIn && (
              <Slider
                value={[endowmentPct]}
                onValueChange={([v]) => setEndowmentPct(v)}
                min={1}
                max={2}
                step={0.5}
                className="w-full"
              />
            )}
            <Separator />
          </div>
        )}

        {/* Split bars */}
        <div className="flex h-3 rounded-full overflow-hidden">
          {result.splits.map((s) => (
            <div
              key={s.splitType}
              className={`${SPLIT_COLORS[s.splitType] || "bg-muted"}`}
              style={{ width: `${(s.amount / result.totalCharged) * 100}%` }}
              title={`${SPLIT_LABELS[s.splitType]}: $${s.amount.toFixed(2)}`}
            />
          ))}
        </div>

        {/* Line items */}
        <div className="space-y-1.5">
          {result.splits.map((s) => (
            <div key={s.splitType} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-full ${SPLIT_COLORS[s.splitType] || "bg-muted"}`} />
                <span className="text-muted-foreground">{SPLIT_LABELS[s.splitType]}</span>
              </div>
              <span className="font-medium">${s.amount.toFixed(2)}</span>
            </div>
          ))}
          <Separator />
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>{orgAbsorbsFees ? "Total (Donor Pays)" : "Total Charged"}</span>
            <span className="text-primary">${result.totalCharged.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Organization Receives</span>
            <span className="font-medium text-primary">${result.orgPayout.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

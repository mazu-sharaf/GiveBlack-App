import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchGiveblackFinancialSummary, type GiveblackFinancialSummary, type GiveblackFinancialPreset } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Landmark, PieChart, RefreshCw } from "lucide-react";

const PRESETS: { id: GiveblackFinancialPreset; label: string; hint?: string }[] = [
  { id: "day", label: "Today (UTC)", hint: "From midnight UTC through now" },
  { id: "week", label: "7 days", hint: "Rolling last 7 days" },
  { id: "month", label: "Month (UTC)", hint: "From 1st of this month UTC through now" },
  { id: "year", label: "Year (UTC)", hint: "From Jan 1 UTC through now" },
  { id: "custom", label: "Custom", hint: "UTC dates, max 366 days" },
];

function money(n: number) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function GiveBlackFinancialsPage() {
  const [preset, setPreset] = useState<GiveblackFinancialPreset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<GiveblackFinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (preset === "custom" && (!from || !to)) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetchGiveblackFinancialSummary(
        preset === "custom" ? { preset: "custom", from, to } : { preset }
      );
      setData(res);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load summary");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [preset, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const rangeLabel = useMemo(() => {
    if (!data) return "";
    const a = new Date(data.from).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    const b = new Date(data.to).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    return `${a} → ${b}`;
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <PieChart className="h-6 w-6" />
            GiveBlack financials
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Filtered totals for donations, platform fee model, estimated Stripe fees, subscriptions, and ledger activity.
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Time range</CardTitle>
          <p className="text-xs text-muted-foreground">
            Presets use UTC boundaries where noted. Custom uses <code className="text-[11px]">YYYY-MM-DD</code> interpreted as UTC.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.id}
                type="button"
                size="sm"
                variant={preset === p.id ? "default" : "outline"}
                className="rounded-lg"
                onClick={() => setPreset(p.id)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="gb-from">From</Label>
                <Input id="gb-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gb-to">To</Label>
                <Input id="gb-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Button type="button" onClick={() => void load()} disabled={loading || !from || !to}>
                  Apply range
                </Button>
              </div>
            </div>
          )}
          {PRESETS.find((p) => p.id === preset)?.hint && (
            <p className="text-xs text-muted-foreground">{PRESETS.find((p) => p.id === preset)?.hint}</p>
          )}
          {data && (
            <p className="text-xs text-muted-foreground border-t border-white/10 pt-3">
              Active window: <span className="text-foreground font-medium">{rangeLabel}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total collected</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-primary">{money(data.combined.total_collected)}</p>
                <p className="text-xs text-muted-foreground mt-1">Donations gross + subscription payments (in range)</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">GiveBlack platform fee (donations)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{money(data.combined.giveblack_platform_fee_donations)}</p>
                <p className="text-xs text-muted-foreground mt-1">{data.notes.giveblack_platform_fee}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Stripe fees (estimate)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{money(data.combined.stripe_fee_estimate_total)}</p>
                <p className="text-xs text-muted-foreground mt-1">{data.notes.stripe_fee}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Education reinvest</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{money(data.combined.education_reinvest_total)}</p>
                <p className="text-xs text-muted-foreground mt-1">Sum of donation reinvest_amount (succeeded)</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Net to orgs (donations)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{money(data.donations.net_to_org_payout_usd)}</p>
                <p className="text-xs text-muted-foreground mt-1">{data.notes.net_to_org_payout_usd}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Landmark className="h-4 w-4" />
                  Ledger (same window)
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1 text-muted-foreground">
                <div className="flex justify-between">
                  <span>Platform</span>
                  <span className="font-medium text-foreground">{money(data.ledger.platform)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Organization</span>
                  <span className="font-medium text-foreground">{money(data.ledger.org)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ecosystem</span>
                  <span className="font-medium text-foreground">{money(data.ledger.ecosystem)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Endowment</span>
                  <span className="font-medium text-foreground">{money(data.ledger.endowment)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Donations</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex justify-between border-b border-white/5 py-2">
                  <span className="text-muted-foreground">Count</span>
                  <span className="font-medium">{data.donations.count}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 py-2">
                  <span className="text-muted-foreground">Gross</span>
                  <span className="font-medium">{money(data.donations.gross_total)}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 py-2">
                  <span className="text-muted-foreground">GiveBlack platform fee (3%)</span>
                  <span className="font-medium">{money(data.donations.giveblack_platform_fee)}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 py-2">
                  <span className="text-muted-foreground">Stripe fee (est.)</span>
                  <span className="font-medium">{money(data.donations.stripe_fee_estimate)}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 py-2">
                  <span className="text-muted-foreground">Education reinvest</span>
                  <span className="font-medium">{money(data.donations.education_reinvest)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">Net to org (stored basis)</span>
                  <span className="font-medium">{money(data.donations.net_to_org_payout_usd)}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Subscriptions</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex justify-between border-b border-white/5 py-2">
                  <span className="text-muted-foreground">Paid invoices</span>
                  <span className="font-medium">{data.subscriptions.payment_count}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 py-2">
                  <span className="text-muted-foreground">Gross collected</span>
                  <span className="font-medium">{money(data.subscriptions.gross_total)}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 py-2">
                  <span className="text-muted-foreground">Stripe fee (est.)</span>
                  <span className="font-medium">{money(data.subscriptions.stripe_fee_estimate)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-muted-foreground">GiveBlack after Stripe (est.)</span>
                  <span className="font-medium">{money(data.subscriptions.giveblack_revenue_after_stripe_estimate)}</span>
                </div>
                <p className="text-xs text-muted-foreground pt-2">
                  Subscription rows come from Stripe <code className="text-[11px]">invoice.paid</code> when webhooks are configured.
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No data</p>
      )}
    </div>
  );
}

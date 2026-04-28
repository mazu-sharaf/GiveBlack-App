import { useEffect, useState } from "react";
import { fetchFundReleaseSummary, releaseOrgFunds, type FundReleaseOrgRow } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Landmark, RefreshCw } from "lucide-react";

function centsToUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function FundReleasePage() {
  const [rows, setRows] = useState<FundReleaseOrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);

  const load = async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    try {
      const res = await fetchFundReleaseSummary();
      setRows(res.organizations || []);
    } catch (err: unknown) {
      if (!opts?.quiet) toast.error(err instanceof Error ? err.message : "Failed to load balances");
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load({ quiet: true });
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const handleRelease = async (org: FundReleaseOrgRow) => {
    if (org.total_hold_cents <= 0) return;
    setReleasing(org.org_id);
    try {
      const res = await releaseOrgFunds(org.org_id);
      toast.success(
        `Released ${centsToUsd(res.amount_cents)}. Transfer ${res.transfer_id} (${res.donation_count} donations).`
      );
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Release failed");
    } finally {
      setReleasing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="h-6 w-6" /> Fund release (Stripe Connect)
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            New donations get an automatic hold (14 days on free, 7 days on paid plans). When Connect payouts are on,
            amounts that have passed the hold date transfer to the org&apos;s Stripe account automatically on a
            schedule. Use <strong>Release</strong> anytime to move <em>all</em> held net funds immediately; no need to
            wait for the hold. This page refreshes every 30s while open.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Connect</TableHead>
                    <TableHead className="text-right">In hold window</TableHead>
                    <TableHead className="text-right">Past hold</TableHead>
                    <TableHead className="text-right">Total held</TableHead>
                    <TableHead className="w-36"> </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const canRelease = r.total_hold_cents > 0 && r.stripe_account_id && r.payouts_enabled;
                    return (
                      <TableRow key={r.org_id}>
                        <TableCell className="font-medium">{r.org_name || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{r.plan_tier}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {!r.stripe_account_id ? (
                            <span className="text-amber-500">Not connected</span>
                          ) : r.payouts_enabled ? (
                            <span className="text-primary">Payouts on</span>
                          ) : (
                            <span className="text-amber-500">Onboarding</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{centsToUsd(r.pending_cents)}</TableCell>
                        <TableCell className="text-right tabular-nums">{centsToUsd(r.eligible_cents)}</TableCell>
                        <TableCell className="text-right tabular-nums">{centsToUsd(r.total_hold_cents)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            className="bg-primary hover:bg-primary/90"
                            disabled={!canRelease || releasing === r.org_id}
                            onClick={() => void handleRelease(r)}
                          >
                            {releasing === r.org_id ? "…" : r.pending_cents > 0 && r.eligible_cents === 0 ? "Release early" : "Release"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No organizations
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

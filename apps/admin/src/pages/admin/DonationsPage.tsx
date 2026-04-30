import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchDonations, reconcilePendingDonationsWithStripe } from "@/lib/api";
import { getCurrentRole } from "@/lib/admin-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, Heart, Download, DollarSign } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  succeeded: "bg-primary/20 text-primary border-primary/30",
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function DonationsPage() {
  const navigate = useNavigate();
  const [donations, setDonations] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [feeDetail, setFeeDetail] = useState<Record<string, unknown> | null>(null);
  const [total, setTotal] = useState(0);
  const [reconciling, setReconciling] = useState(false);
  const role = getCurrentRole();
  const canReconcileStripe = ["admin", "super_admin", "manager"].includes(role);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter !== "all") params.status = statusFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await fetchDonations(params);
      setDonations(res.donations || []);
      setTotal(res.total || 0);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load donations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const handleReconcileStripe = async () => {
    setReconciling(true);
    try {
      const res = await reconcilePendingDonationsWithStripe();
      const repaired = res.repaired_hold ?? 0;
      const repairMsg = repaired > 0 ? ` Repaired ${repaired} payout-hold row(s) and resynced org totals.` : "";
      if (res.errors?.length) {
        toast.warning(
          `Updated ${res.fixed} donation(s).${repairMsg} ${res.errors.length} row(s) had errors; see console.`,
        );
        console.warn("[reconcile]", res.errors);
      } else {
        toast.success(
          res.fixed > 0
            ? `Synced with Stripe: ${res.fixed} donation(s) marked succeeded.${repairMsg}`
            : repaired > 0
              ? `No pending updates.${repairMsg}`.trim()
              : "No pending donations needed updating (or none matched Stripe as paid).",
        );
      }
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setReconciling(false);
    }
  };

  const totalAmount = donations.reduce((s, d) => s + Number(d.amount || 0), 0);
  const totalFees = donations.reduce((s, d) => s + Number(d.platform_fee || 0), 0);

  const exportCSV = () => {
    const header = "Date,Donor,Email,Organization,Amount,Fee,Net,Status,EducationPartner,PartnerReinvest,GeneralReinvest\n";
    const rows = donations.map((d) =>
      `${d.created_at ? format(new Date(d.created_at as string), "yyyy-MM-dd") : ""},${String(d.donor_name || "").replace(/,/g, "")},${d.user_email || ""},${String(d.org_name || "").replace(/,/g, "")},${d.amount},${d.platform_fee || 0},${d.net_to_org || d.amount},${d.status || "pending"},${String(d.education_partner_name || "").replace(/,/g, "")},${d.partner_reinvest_amount ?? ""},${d.general_reinvest_amount ?? ""}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `donations-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Heart className="h-6 w-6" /> Donations</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {total} donations -- Total: ${totalAmount.toLocaleString()} -- Fees: ${totalFees.toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReconcileStripe && (
            <Button variant="secondary" size="sm" disabled={reconciling} onClick={handleReconcileStripe}>
              <DollarSign className="h-4 w-4 mr-1" /> {reconciling ? "Syncing…" : "Sync pending with Stripe"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by donor, email, or organization..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Button type="submit" variant="secondary">Search</Button>
            </form>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="succeeded">Succeeded</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-sm text-muted-foreground whitespace-nowrap">From:</span>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="flex-1" />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-sm text-muted-foreground whitespace-nowrap">To:</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="flex-1" />
            </div>
            <Button variant="secondary" onClick={load}>Apply Dates</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Donor</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="max-w-[120px]">Partner</TableHead>
                    <TableHead className="w-16">Fees</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {donations.map((d) => (
                    <TableRow key={String(d.id)} className="cursor-pointer hover:bg-muted/50" onClick={() => d.user_email && navigate(`/donors/${encodeURIComponent(String(d.user_email))}`)}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {String(d.donor_name || "Unknown")}
                            {d.is_anonymous && <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">Anonymous</span>}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{d.is_anonymous ? "-" : String(d.user_email || "")}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground truncate max-w-[150px]">{String(d.org_name || "--")}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">${Number(d.amount).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground whitespace-nowrap">${Number(d.platform_fee || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_COLORS[String(d.status)] || ""}>{String(d.status || "pending")}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {d.created_at ? format(new Date(d.created_at as string), "MMM d, yyyy") : "--"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs truncate max-w-[120px]">
                        {d.education_partner_name ? String(d.education_partner_name) : "-"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => { e.stopPropagation(); setFeeDetail(d); }}
                        >
                          <DollarSign className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {donations.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No donations found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!feeDetail} onOpenChange={() => setFeeDetail(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Fee Breakdown</DialogTitle>
          </DialogHeader>
          {feeDetail && (() => {
            const amount = Number(feeDetail.amount || 0);
            const platformFee = Number(feeDetail.platform_fee || 0);
            const processingFee = Number(feeDetail.processing_fee || (amount * 0.029 + 0.30));
            const reinvestAmount = Number(feeDetail.reinvest_amount ?? 0);
            const partnerReinvest = Number(feeDetail.partner_reinvest_amount ?? 0);
            const generalReinvest = Number(feeDetail.general_reinvest_amount ?? 0);
            const netToOrg = Number(feeDetail.net_to_org || (amount - platformFee));
            return (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Donation Amount</span>
                  <span className="font-semibold">${amount.toLocaleString()}</span>
                </div>
                <div className="border-t border-border pt-2 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fee Breakdown</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Platform Fee</span>
                    <span className="text-amber-400">${platformFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processing Fee (Stripe)</span>
                    <span className="text-amber-400">${processingFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reinvest (total)</span>
                    <span className="text-cyan-400">${reinvestAmount.toFixed(2)}</span>
                  </div>
                  {(partnerReinvest > 0 || generalReinvest > 0) && (
                    <>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Attributed partner</span>
                        <span className="text-cyan-300">${partnerReinvest.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">General fund</span>
                        <span className="text-cyan-300">${generalReinvest.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="border-t border-border pt-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground font-medium">Net to Organization</span>
                    <span className="text-primary font-semibold">${netToOrg.toFixed(2)}</span>
                  </div>
                </div>
                <div className="border-t border-border pt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Donor</span>
                    <span>{String(feeDetail.donor_name || "Unknown")}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Organization</span>
                    <span>{String(feeDetail.org_name || "--")}</span>
                  </div>
                  {feeDetail.education_partner_name && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Education partner</span>
                      <span>{String(feeDetail.education_partner_name)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className={STATUS_COLORS[String(feeDetail.status)] || ""}>{String(feeDetail.status || "pending")}</Badge>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Date</span>
                    <span>{feeDetail.created_at ? format(new Date(feeDetail.created_at as string), "MMM d, yyyy HH:mm") : "--"}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

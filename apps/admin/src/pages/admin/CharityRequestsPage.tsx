import { useEffect, useState } from "react";
import { dbQuery, approveCharityRequest, rejectCharityRequest, adminAddSubscriptionByOrg, adminRemoveSubscriptionByOrg } from "@/lib/api";
import type { QueryOptions } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, FileText, CheckCircle, XCircle, Eye } from "lucide-react";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  approved: "bg-primary/20 text-primary border-primary/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
};

interface CharityRequest {
  id: string;
  charity_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  category?: string;
  description: string;
  website: string;
  tax_id: string;
  bank_name: string;
  account_holder_name: string;
  account_last4: string;
  routing_number: string;
  account_number?: string;
  status: string;
  admin_notes: string;
  rejection_reason: string;
  reviewed_at: string;
  created_at: string;
}

function maskDigitsLast4(value: string | null | undefined): string {
  if (!value || !String(value).trim()) return "-";
  const s = String(value).replace(/\s/g, "");
  if (s.length <= 4) return `···${s}`;
  return `···${s.slice(-4)}`;
}

interface OrganizationRow {
  id: string;
  name: string;
  contact_email: string | null;
}

interface OrgSubscriptionRow {
  id: string;
  org_id: string;
  tier: string;
  status: string;
}

export default function CharityRequestsPage() {
  const [requests, setRequests] = useState<CharityRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewRequest, setReviewRequest] = useState<CharityRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [orgIdForReview, setOrgIdForReview] = useState<string | null>(null);
  const [orgSubForReview, setOrgSubForReview] = useState<OrgSubscriptionRow | null>(null);
  const [loadingOrgSub, setLoadingOrgSub] = useState(false);
  const [subActionLoading, setSubActionLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const filters: Array<{ column: string; op: string; value: unknown }> = [];
      if (statusFilter !== "all") filters.push({ column: "status", op: "eq", value: statusFilter });
      const opts: QueryOptions = {
        filters,
        order: { column: "created_at", ascending: false },
        limit: 200,
      };
      if (search) {
        opts.orRaw = `charity_name.ilike.%${search}%,contact_email.ilike.%${search}%`;
      }
      const res = await dbQuery<CharityRequest>("charity_requests", opts);
      setRequests(res.data || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const handleApprove = async () => {
    if (!reviewRequest) return;
    setProcessing(true);
    try {
      await approveCharityRequest(reviewRequest.id, adminNotes);
      toast.success("Request approved and organization created. Confirmation email sent to applicant.");
      setReviewRequest(null);
      setAdminNotes("");
      setRejectionReason("");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to approve request");
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!reviewRequest) return;
    setProcessing(true);
    try {
      await rejectCharityRequest(reviewRequest.id, rejectionReason);
      toast.success("Request rejected. Email with reason sent to applicant.");
      setReviewRequest(null);
      setAdminNotes("");
      setRejectionReason("");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reject request");
    } finally {
      setProcessing(false);
    }
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const loadOrgSubscriptionForReview = async (requestItem: CharityRequest | null) => {
    if (!requestItem || requestItem.status !== "approved") {
      setOrgIdForReview(null);
      setOrgSubForReview(null);
      return;
    }
    setLoadingOrgSub(true);
    try {
      let org: OrganizationRow | null = null;
      if (requestItem.contact_email) {
        const byEmail = await dbQuery<OrganizationRow>("organizations", {
          filters: [{ column: "contact_email", op: "eq", value: requestItem.contact_email }],
          limit: 1,
        });
        org = byEmail.data?.[0] || null;
      }
      if (!org && requestItem.charity_name) {
        const byName = await dbQuery<OrganizationRow>("organizations", {
          filters: [{ column: "name", op: "eq", value: requestItem.charity_name }],
          limit: 1,
        });
        org = byName.data?.[0] || null;
      }
      if (!org) {
        setOrgIdForReview(null);
        setOrgSubForReview(null);
        return;
      }
      setOrgIdForReview(org.id);
      const subRes = await dbQuery<OrgSubscriptionRow>("org_subscriptions", {
        filters: [{ column: "org_id", op: "eq", value: org.id }],
        order: { column: "created_at", ascending: false },
        limit: 1,
      });
      setOrgSubForReview(subRes.data?.[0] || null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load organization subscription");
    } finally {
      setLoadingOrgSub(false);
    }
  };

  const handleQuickAddPlan = async (tier: "growth" | "institutional") => {
    if (!orgIdForReview) {
      toast.error("Organization not found for this request");
      return;
    }
    setSubActionLoading(true);
    try {
      await adminAddSubscriptionByOrg(orgIdForReview, tier);
      toast.success(`${tier} plan added`);
      await loadOrgSubscriptionForReview(reviewRequest);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add plan");
    } finally {
      setSubActionLoading(false);
    }
  };

  const handleQuickRemovePlan = async () => {
    if (!orgIdForReview) {
      toast.error("Organization not found for this request");
      return;
    }
    setSubActionLoading(true);
    try {
      await adminRemoveSubscriptionByOrg(orgIdForReview);
      toast.success("Plan removed");
      await loadOrgSubscriptionForReview(reviewRequest);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove plan");
    } finally {
      setSubActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" /> Charity Requests</h2>
          <p className="text-sm text-muted-foreground mt-1">{requests.length} requests ({pendingCount} pending)</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Button type="submit" variant="secondary">Search</Button>
            </form>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Charity Name</TableHead>
                    <TableHead className="hidden lg:table-cell">Category</TableHead>
                    <TableHead className="hidden sm:table-cell">Contact</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.charity_name || "--"}</TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">{r.category || "-"}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">{r.contact_email || "--"}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground truncate max-w-[200px]">{r.description?.slice(0, 80) || "--"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[r.status] || ""}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                        {r.created_at ? format(new Date(r.created_at), "MMM d, yyyy") : "--"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            setReviewRequest(r);
                            setAdminNotes("");
                            setRejectionReason("");
                            await loadOrgSubscriptionForReview(r);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {requests.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No charity requests found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reviewRequest} onOpenChange={() => { setReviewRequest(null); setOrgIdForReview(null); setOrgSubForReview(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review Request: {reviewRequest?.charity_name || "--"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><strong>Contact Name:</strong><br />{reviewRequest?.contact_name || "--"}</div>
              <div><strong>Contact Email:</strong><br />{reviewRequest?.contact_email || "--"}</div>
              <div><strong>Phone:</strong><br />{reviewRequest?.contact_phone || "--"}</div>
              <div><strong>Category:</strong><br />{reviewRequest?.category || "-"}</div>
            </div>
            <div><strong>Website:</strong> {reviewRequest?.website || "--"}</div>
            <div><strong>Description:</strong><br />{reviewRequest?.description || "--"}</div>
            <div className="border-t border-border pt-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payout / verification</div>
              <div className="grid grid-cols-2 gap-2">
                <div><strong>Tax ID:</strong><br />{reviewRequest?.tax_id || "-"}</div>
                <div><strong>Routing:</strong><br />{maskDigitsLast4(reviewRequest?.routing_number)}</div>
                <div><strong>Account last 4:</strong><br />{reviewRequest?.account_last4 || "-"}</div>
                <div><strong>Account number (masked):</strong><br />{reviewRequest?.account_number ? maskDigitsLast4(reviewRequest.account_number) : "-"}</div>
              </div>
              {(reviewRequest?.bank_name || reviewRequest?.account_holder_name) && (
                <div>
                  <strong>Bank / holder:</strong>{" "}
                  {[reviewRequest?.bank_name, reviewRequest?.account_holder_name].filter(Boolean).join(" · ") || "-"}
                </div>
              )}
            </div>
            {reviewRequest?.status !== "pending" && (
              <div className="border-t border-border pt-2 space-y-1">
                <div><strong>Status:</strong> <Badge variant="outline" className={statusColors[reviewRequest?.status || ""] || ""}>{reviewRequest?.status}</Badge></div>
                {reviewRequest?.admin_notes && <div><strong>Admin Notes:</strong> {reviewRequest.admin_notes}</div>}
                {reviewRequest?.rejection_reason && <div><strong>Rejection Reason:</strong> {reviewRequest.rejection_reason}</div>}
                {reviewRequest?.reviewed_at && <div><strong>Reviewed:</strong> {format(new Date(reviewRequest.reviewed_at), "MMM d, yyyy HH:mm")}</div>}
              </div>
            )}
            {reviewRequest?.status === "approved" && (
              <div className="border-t border-border pt-3 space-y-2">
                <div className="text-xs text-muted-foreground">Quick subscription actions</div>
                <div className="text-xs">
                  <strong>Current:</strong>{" "}
                  {loadingOrgSub ? "Loading..." : orgSubForReview ? `${orgSubForReview.tier} (${orgSubForReview.status})` : "No subscription record"}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={subActionLoading || loadingOrgSub}
                    onClick={() => handleQuickAddPlan("growth")}
                  >
                    Add Growth
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={subActionLoading || loadingOrgSub}
                    onClick={() => handleQuickAddPlan("institutional")}
                  >
                    Add Institutional
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={subActionLoading || loadingOrgSub}
                    onClick={handleQuickRemovePlan}
                  >
                    Remove Plan
                  </Button>
                </div>
              </div>
            )}
            {reviewRequest?.status === "pending" && (
              <div className="space-y-3 border-t border-border pt-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Admin notes (optional, for approval; internal only)</label>
                  <Textarea
                    placeholder="Internal notes when approving..."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    className="min-h-[60px] mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Rejection reason (optional; included in email to applicant when you reject)</label>
                  <Textarea
                    placeholder="Reason shown to applicant in rejection email..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="min-h-[80px] mt-1"
                  />
                </div>
              </div>
            )}
          </div>
          {reviewRequest?.status === "pending" && (
            <DialogFooter className="gap-2">
              <Button variant="destructive" onClick={handleReject} disabled={processing}>
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
              <Button onClick={handleApprove} disabled={processing} className="bg-primary hover:bg-primary/90">
                <CheckCircle className="h-4 w-4 mr-1" /> Approve
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

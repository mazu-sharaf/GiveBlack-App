import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchCommunityCampaign, setCommunityCampaignVerification, updateCommunityCampaignStatus, updateCommunityReport } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Check, XCircle, AlertTriangle, User, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function CommunityCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Record<string, unknown> | null>(null);
  const [updates, setUpdates] = useState<Record<string, unknown>[]>([]);
  const [donations, setDonations] = useState<Record<string, unknown>[]>([]);
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [creator, setCreator] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportNotes, setReportNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchCommunityCampaign(id);
        setCampaign(res.campaign);
        setUpdates(res.updates || []);
        setDonations(res.donations || []);
        setReports(res.reports || []);
        setCreator(res.creator);
      } catch {
        setCampaign(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleVerificationChange = async (newStatus: string) => {
    if (!id) return;
    try {
      await setCommunityCampaignVerification(id, newStatus);
      toast.success(`Verification set to ${newStatus}`);
      setCampaign((prev) => prev ? { ...prev, verification_status: newStatus } : null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
    }
  };

  const handleStatus = async (status: string) => {
    if (!id) return;
    try {
      await updateCommunityCampaignStatus(id, status);
      toast.success(`Status set to ${status}`);
      setCampaign((prev) => prev ? { ...prev, status } : null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
    }
  };

  const handleReportUpdate = async (reportId: string, status: string) => {
    try {
      await updateCommunityReport(reportId, { status, admin_notes: reportNotes[reportId] });
      toast.success("Report updated");
      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status, admin_notes: reportNotes[reportId] } : r)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/community-campaigns")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <p className="text-muted-foreground">Campaign not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Button variant="ghost" size="sm" onClick={() => navigate("/community-campaigns")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <CardTitle>{campaign.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{campaign.description?.slice(0, 200)}{campaign.description?.length > 200 ? "..." : ""}</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className={campaign.status === "active" ? "bg-primary/20 text-primary" : ""}>{campaign.status}</Badge>
                <Badge variant="outline" className={campaign.verification_status === "verified" ? "bg-primary/20 text-primary" : campaign.verification_status === "flagged" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}>
                  {campaign.verification_status}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={campaign.verification_status} onValueChange={handleVerificationChange}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="flagged">Flagged</SelectItem>
                </SelectContent>
              </Select>
              <Select value={campaign.status} onValueChange={handleStatus}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="ended">Ended</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground">Creator:</span> <span className="font-medium">{creator?.name || creator?.email || "--"}</span></div>
            <div><span className="text-muted-foreground">Goal:</span> <span className="font-medium">${Number(campaign.goal || campaign.goal_amount || 0).toLocaleString()}</span></div>
            <div><span className="text-muted-foreground">Raised:</span> <span className="font-medium text-primary">${Number(campaign.raised || campaign.raised_amount || 0).toLocaleString()}</span></div>
            <div><span className="text-muted-foreground">Donors:</span> <span className="font-medium">{campaign.donor_count ?? 0}</span></div>
          </div>
          <p className="text-xs text-muted-foreground">Created {campaign.created_at ? format(new Date(campaign.created_at), "PPpp") : "--"}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Updates</CardTitle></CardHeader>
          <CardContent>
            {updates.length === 0 ? <p className="text-muted-foreground text-sm">No updates yet.</p> : (
              <ul className="space-y-3">
                {updates.map((u) => (
                  <li key={u.id} className="text-sm border-b border-border pb-2 last:border-0">
                    <p>{u.content}</p>
                    <span className="text-xs text-muted-foreground">{u.created_at ? format(new Date(u.created_at), "PP") : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent Donations</CardTitle></CardHeader>
          <CardContent>
            {donations.length === 0 ? <p className="text-muted-foreground text-sm">No donations yet.</p> : (
              <ul className="space-y-2">
                {donations.slice(0, 20).map((d) => (
                  <li key={d.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{d.donor_name || "Anonymous"}</span>
                    <div className="text-right">
                      <span className="font-medium text-primary">${Number(d.amount).toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground ml-2">{d.created_at ? format(new Date(d.created_at), "MMM d") : ""}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Reports ({reports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? <p className="text-muted-foreground text-sm">No reports.</p> : (
            <ul className="space-y-4">
              {reports.map((r) => (
                <li key={r.id} className="border rounded-lg p-4 text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <p><strong>Reason:</strong> {r.reason}</p>
                    <Badge variant="outline">{r.status}</Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">{r.reporter_name || ""} -- {r.created_at ? format(new Date(r.created_at), "PPpp") : ""}</p>
                  <div className="flex gap-2 items-end">
                    <Textarea placeholder="Admin notes" value={reportNotes[r.id] ?? r.admin_notes ?? ""} onChange={(e) => setReportNotes((n) => ({ ...n, [r.id]: e.target.value }))} className="min-h-[60px] flex-1" />
                    <div className="flex flex-col gap-1">
                      <Select value={r.status} onValueChange={(v) => handleReportUpdate(r.id, v)}>
                        <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="reviewed">Reviewed</SelectItem>
                          <SelectItem value="dismissed">Dismissed</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={() => handleReportUpdate(r.id, r.status)}>Save</Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { dbQuery, dbMutate, deleteAdminCampaign } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Search, Megaphone, Plus, Share2, Copy, ExternalLink, Trash2, Star } from "lucide-react";
import { format } from "date-fns";
import { getCurrentRole } from "@/lib/admin-auth";

interface Row {
  id: string;
  organization_id: string;
  title: string;
  featured?: boolean;
  goal: number;
  raised: number;
  status: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  active: "bg-primary/20 text-primary border-primary/30",
  paused: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  completed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  closed: "bg-red-500/20 text-red-400 border-red-500/30",
  draft: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  pending_review: "bg-violet-500/20 text-violet-300 border-violet-500/30",
};

export default function CampaignsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orgFilter = searchParams.get("org") || "";
  const role = getCurrentRole();
  const canDelete = role === "admin" || role === "super_admin";
  const canFeature = canDelete;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters: Array<{ column: string; op: string; value: unknown }> = [];
      if (orgFilter) filters.push({ column: "organization_id", op: "eq", value: orgFilter });

      const res = await dbQuery<Row>("campaigns", {
        select: "id, organization_id, title, featured, goal, raised, status, created_at",
        filters: filters.length ? filters : undefined,
        order: { column: "created_at", ascending: false },
        limit: 500,
      });
      setRows(res.data || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not load campaigns");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orgFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q
      ? rows
      : rows.filter((r) => r.title.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
    return [...base].sort((a, b) => {
      const pa = a.status === "pending_review" ? 0 : 1;
      const pb = b.status === "pending_review" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [rows, search]);

  const campaignPublicUrl = (campaignId: string): string => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin.replace(/\/$/, "")}/c/${encodeURIComponent(campaignId)}`;
  };

  const handleCopy = async (e: React.MouseEvent, campaignId: string) => {
    e.stopPropagation();
    const url = campaignPublicUrl(campaignId);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Campaign link copied");
    } catch {
      toast.error("Could not copy link. Try opening it instead.");
    }
  };

  const handleShare = async (e: React.MouseEvent, campaignId: string, title: string) => {
    e.stopPropagation();
    const url = campaignPublicUrl(campaignId);
    if (!url) return;
    try {
      // Web Share API (mobile browsers)
      if (typeof navigator !== "undefined" && "share" in navigator) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (navigator as any).share({ title, text: `Support ${title} on GiveBlack!`, url });
        return;
      }
    } catch {
      // fallthrough
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Campaign link copied");
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleOpen = (e: React.MouseEvent, campaignId: string) => {
    e.stopPropagation();
    const url = campaignPublicUrl(campaignId);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async (campaignId: string) => {
    try {
      await deleteAdminCampaign(campaignId, { force: true });
      toast.success("Campaign deleted");
      setRows((prev) => prev.filter((r) => r.id !== campaignId));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const pageIds = filtered.map((r) => r.id);
  const selectedCount = selected.size;
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));
  const toggleRowSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePageSelect = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });

  const bulkDeleteSelected = async () => {
    if (!canDelete || selected.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    try {
      const results = await Promise.allSettled(ids.map((id) => deleteAdminCampaign(id, { force: true })));
      const okIds: string[] = [];
      const failed: Array<{ id: string; reason: string }> = [];
      results.forEach((r, idx) => {
        const id = ids[idx]!;
        if (r.status === "fulfilled") okIds.push(id);
        else failed.push({ id, reason: r.reason instanceof Error ? r.reason.message : "Delete failed" });
      });
      if (okIds.length) setRows((prev) => prev.filter((r) => !okIds.includes(r.id)));
      setSelected(new Set(failed.map((f) => f.id)));
      if (failed.length === 0) toast.success(`Deleted ${okIds.length} campaign${okIds.length === 1 ? "" : "s"}`);
      else toast.error(`Deleted ${okIds.length}. Failed ${failed.length}. First: ${failed[0]?.reason || "Unknown"}`);
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleFeatured = async (e: React.MouseEvent, row: Row) => {
    e.stopPropagation();
    if (!canFeature) return;
    const next = !Boolean(row.featured);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, featured: next } : r)));
    try {
      await dbMutate("campaigns", "update", { featured: next }, [{ column: "id", op: "eq", value: row.id }]);
      toast.success(next ? "Marked as featured" : "Removed from featured");
    } catch (err: unknown) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, featured: row.featured } : r)));
      toast.error(err instanceof Error ? err.message : "Failed to update featured");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6" /> Organization campaigns
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} campaign{filtered.length === 1 ? "" : "s"}
            {orgFilter ? ` · filtered by organization` : ""}
          </p>
        </div>
        <Button onClick={() => navigate("/campaigns/new")}>
          <Plus className="h-4 w-4 mr-2" /> New campaign
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title or id..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allPageSelected ? true : somePageSelected && !allPageSelected ? "indeterminate" : false}
                        onCheckedChange={() => togglePageSelect()}
                        aria-label="Select all on this page"
                      />
                    </TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead className="text-right">Goal</TableHead>
                    <TableHead className="text-right">Raised</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Link</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/campaigns/${r.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={() => toggleRowSelect(r.id)}
                          aria-label={`Select ${r.title || r.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{r.title}</span>
                          {Boolean(r.featured) && (
                            <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                              <Star className="h-3 w-3 mr-0.5" />
                              Featured
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {r.organization_id}
                      </TableCell>
                      <TableCell className="text-right">${Number(r.goal).toLocaleString()}</TableCell>
                      <TableCell className="text-right">${Number(r.raised).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[r.status] || statusColors.draft}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.status === "active" ? (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Share link"
                              onClick={(e) => void handleShare(e, r.id, r.title)}
                            >
                              <Share2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Copy link"
                              onClick={(e) => void handleCopy(e, r.id)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Open public page"
                              onClick={(e) => handleOpen(e, r.id)}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            {canFeature && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className={[
                                  "h-8 w-8",
                                  Boolean(r.featured) ? "text-amber-500 hover:text-amber-500" : "text-muted-foreground",
                                ].join(" ")}
                                title={Boolean(r.featured) ? "Unfeature" : "Feature"}
                                onClick={(e) => void toggleFeatured(e, r)}
                              >
                                <Star className="h-4 w-4" />
                              </Button>
                            )}
                            {canDelete && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    title="Delete campaign"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete campaign permanently?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This cannot be undone. Campaigns with donations cannot be permanently deleted.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground"
                                      onClick={() => void handleDelete(r.id)}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {r.created_at ? format(new Date(r.created_at), "MMM d, yyyy") : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No campaigns found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {canDelete && selectedCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
          <span className="text-sm text-muted-foreground">
            <strong className="text-foreground">{selectedCount}</strong> selected
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={bulkDeleting}>
              Clear selection
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" size="sm" disabled={bulkDeleting}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete selected
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete selected campaigns?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cannot be undone. Campaigns with donations cannot be permanently deleted. Type <strong>DELETE</strong> to confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="pt-2">
                  <Input
                    value={bulkDeleteConfirm}
                    onChange={(e) => setBulkDeleteConfirm(e.target.value)}
                    placeholder='Type "DELETE"'
                    autoComplete="off"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground"
                    disabled={bulkDeleteConfirm.trim().toUpperCase() !== "DELETE"}
                    onClick={() => {
                      setBulkDeleteConfirm("");
                      void bulkDeleteSelected();
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { dbQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, Megaphone, Plus } from "lucide-react";
import { format } from "date-fns";

interface Row {
  id: string;
  organization_id: string;
  title: string;
  goal: number;
  raised: number;
  status: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
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

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters: Array<{ column: string; op: string; value: unknown }> = [];
      if (orgFilter) filters.push({ column: "organization_id", op: "eq", value: orgFilter });

      const res = await dbQuery<Row>("campaigns", {
        select: "id, organization_id, title, goal, raised, status, created_at",
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
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden md:table-cell">Organization</TableHead>
                    <TableHead className="text-right">Goal</TableHead>
                    <TableHead className="text-right">Raised</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/campaigns/${r.id}`)}
                    >
                      <TableCell className="font-medium">{r.title}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {r.organization_id}
                      </TableCell>
                      <TableCell className="text-right">${Number(r.goal).toLocaleString()}</TableCell>
                      <TableCell className="text-right">${Number(r.raised).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[r.status] || statusColors.draft}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                        {r.created_at ? format(new Date(r.created_at), "MMM d, yyyy") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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
    </div>
  );
}

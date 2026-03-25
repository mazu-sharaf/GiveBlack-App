import { useEffect, useState } from "react";
import { dbQuery, dbMutate } from "@/lib/api";
import type { QueryOptions } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, Users, Download } from "lucide-react";
import { format } from "date-fns";

interface Volunteer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  skills: string;
  message?: string;
  org_id: string | null;
  org_name?: string;
  status?: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  approved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  active: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export default function VolunteersPage() {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const opts: QueryOptions = {
        order: { column: "created_at", ascending: false },
        limit: 200,
      };
      if (search) {
        opts.orRaw = `name.ilike.%${search}%,email.ilike.%${search}%`;
      }
      if (statusFilter !== "all") {
        opts.filters = [{ column: "status", op: "eq", value: statusFilter }];
      }
      const [res, orgsRes] = await Promise.all([
        dbQuery<Volunteer>("volunteers", opts),
        dbQuery<{ id: string; name: string }>("organizations", { select: "id, name", limit: 500 }),
      ]);
      setVolunteers(res.data || []);
      setOrgs(orgsRes.data || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load volunteers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const handleStatusChange = async (volId: string, newStatus: string) => {
    try {
      await dbMutate("volunteers", "update", { status: newStatus }, [{ column: "id", op: "eq", value: volId }]);
      toast.success(`Status set to ${newStatus}`);
      setVolunteers((prev) => prev.map((v) => v.id === volId ? { ...v, status: newStatus } : v));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const handleOrgAssign = async (volId: string, orgId: string) => {
    try {
      await dbMutate("volunteers", "update", { org_id: orgId || null }, [{ column: "id", op: "eq", value: volId }]);
      const orgName = orgs.find((o) => o.id === orgId)?.name || "";
      toast.success(orgId ? `Assigned to ${orgName}` : "Org assignment removed");
      setVolunteers((prev) => prev.map((v) => v.id === volId ? { ...v, org_id: orgId || null, org_name: orgName } : v));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to assign org");
    }
  };

  const getOrgName = (vol: Volunteer) => {
    if (vol.org_name) return vol.org_name;
    if (vol.org_id) return orgs.find((o) => o.id === vol.org_id)?.name || vol.org_id;
    return "--";
  };

  const exportCSV = () => {
    const header = "Name,Email,Phone,Skills,Status,Organization,Date\n";
    const rows = volunteers.map((v) =>
      `${(v.name || "").replace(/,/g, "")},${v.email || ""},${v.phone || ""},${(v.skills || "").replace(/,/g, ";")},${v.status || "pending"},${getOrgName(v).replace(/,/g, "")},${v.created_at ? format(new Date(v.created_at), "yyyy-MM-dd") : ""}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `volunteers-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" /> Volunteers</h2>
          <p className="text-sm text-muted-foreground mt-1">{volunteers.length} volunteers</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search volunteers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Button type="submit" variant="secondary">Search</Button>
            </form>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="active">Active</SelectItem>
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
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="hidden sm:table-cell">Skills</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Organization</TableHead>
                    <TableHead className="hidden lg:table-cell">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {volunteers.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name || "--"}</TableCell>
                      <TableCell className="text-muted-foreground">{v.email || "--"}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground truncate max-w-[150px]">{v.skills || "--"}</TableCell>
                      <TableCell>
                        <Select value={v.status || "pending"} onValueChange={(val) => handleStatusChange(v.id, val)}>
                          <SelectTrigger className="w-[110px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Select value={v.org_id || "__none__"} onValueChange={(val) => handleOrgAssign(v.id, val === "__none__" ? "" : val)}>
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Unassigned</SelectItem>
                            {orgs.map((o) => (
                              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground text-sm whitespace-nowrap">
                        {v.created_at ? format(new Date(v.created_at), "MMM d, yyyy") : "--"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {volunteers.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No volunteers found</TableCell></TableRow>
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

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchCommunityCampaigns } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, Handshake, ExternalLink } from "lucide-react";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  active: "bg-primary/20 text-primary border-primary/30",
  draft: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  ended: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  suspended: "bg-red-500/20 text-red-400 border-red-500/30",
};

const verifyColors: Record<string, string> = {
  verified: "bg-primary/20 text-primary border-primary/30",
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  flagged: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function CommunityCampaignsPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [verifyFilter, setVerifyFilter] = useState("all");
  const [total, setTotal] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof fetchCommunityCampaigns>[0] = { limit: 100 };
      if (search) params.search = search;
      if (statusFilter !== "all") params.status = statusFilter;
      if (verifyFilter !== "all") params.verification_status = verifyFilter;
      const res = await fetchCommunityCampaigns(params);
      setCampaigns(res.campaigns || []);
      setTotal(res.total || 0);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, verifyFilter]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><Handshake className="h-6 w-6" /> Community Campaigns</h2>
        <p className="text-sm text-muted-foreground mt-1">{total} campaigns</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search campaigns..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Button type="submit" variant="secondary">Search</Button>
            </form>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="ended">Ended</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <Select value={verifyFilter} onValueChange={setVerifyFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Verification" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Verification</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden sm:table-cell">Creator</TableHead>
                    <TableHead className="text-right">Goal</TableHead>
                    <TableHead className="text-right">Raised</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Verified</TableHead>
                    <TableHead className="hidden md:table-cell">Created</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/community-campaigns/${c.id}`)}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[200px]">{c.title}</p>
                          <p className="text-xs text-muted-foreground">{c.category_name || ""}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">{c.creator_name || "--"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">${Number(c.goal || c.goal_amount || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-medium text-primary">${Number(c.raised || c.raised_amount || 0).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline" className={statusColors[c.status] || ""}>{c.status}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className={verifyColors[c.verification_status] || ""}>{c.verification_status}</Badge></TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {c.created_at ? format(new Date(c.created_at), "MMM d, yyyy") : "--"}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); navigate(`/community-campaigns/${c.id}`); }}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {campaigns.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No community campaigns found</TableCell></TableRow>
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

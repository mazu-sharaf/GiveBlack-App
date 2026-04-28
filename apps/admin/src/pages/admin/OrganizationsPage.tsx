import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dbQuery, fetchCategories, fetchOrganizationFundMetrics, resolveImageUrl } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, Building2, Plus, Star, ExternalLink, LayoutGrid, List, CheckCircle2, Heart, Megaphone } from "lucide-react";

interface Org {
  id: string;
  name: string;
  description: string;
  category_id: string;
  goal: number;
  raised: number;
  featured: boolean;
  verified: boolean;
  image_url: string;
  image_color: string;
  initials: string;
  created_at: string;
  stripe_account_id: string | null;
  payouts_enabled: boolean;
}

interface Category {
  id: string;
  name: string;
}

export default function OrganizationsPage() {
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [raisedFromDonations, setRaisedFromDonations] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "card">("table");

  const loadCategories = async () => {
    try {
      const res = await fetchCategories();
      setCategories(res.categories || []);
    } catch {
      try {
        const res = await dbQuery<Category>("categories", { select: "id, name" });
        setCategories(res.data || []);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to load categories");
      }
    }
  };

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLoading(true);
      try {
        const q: import("@/lib/api").QueryOptions = {
          select: "id, name, description, category_id, goal, raised, featured, verified, image_url, image_color, initials, created_at, stripe_account_id, payouts_enabled",
          order: { column: "created_at", ascending: false },
          limit: 200,
        };
        if (search) {
          q.orRaw = `name.ilike.%${search}%,description.ilike.%${search}%`;
        }
        if (categoryFilter !== "all") {
          q.filters = [{ column: "category_id", op: "eq", value: categoryFilter }];
        }
        const [res, metricsRes] = await Promise.all([
          dbQuery<Org>("organizations", q),
          fetchOrganizationFundMetrics().catch(() => ({ metrics: [] as { org_id: string; raised_from_donations: number }[] })),
        ]);
        setOrgs(res.data || []);
        const m: Record<string, number> = {};
        for (const row of metricsRes.metrics || []) {
          m[row.org_id] = row.raised_from_donations;
        }
        setRaisedFromDonations(m);
      } catch (err: unknown) {
        if (!opts?.quiet) toast.error(err instanceof Error ? err.message : "Failed to load organizations");
      } finally {
        if (!opts?.quiet) setLoading(false);
      }
    },
    [search, categoryFilter]
  );

  const displayRaised = (org: Org) =>
    Math.max(Number(org.raised || 0), Number(raisedFromDonations[org.id] ?? 0));

  useEffect(() => {
    loadCategories();
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load({ quiet: true });
    }, 25_000);
    return () => window.clearInterval(id);
  }, [load]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const getCategoryName = (catId: string) => categories.find((c) => c.id === catId)?.name || "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6" /> Organizations</h2>
          <p className="text-sm text-muted-foreground mt-1">{orgs.length} organizations</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-border rounded-md">
            <Button variant={viewMode === "table" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-r-none" onClick={() => setViewMode("table")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "card" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-l-none" onClick={() => setViewMode("card")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={() => navigate("/organizations/new")} className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-1" /> New Organization
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search organizations..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Button type="submit" variant="secondary">Search</Button>
            </form>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : viewMode === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgs.map((org) => {
            const raised = displayRaised(org);
            const progress = Number(org.goal) > 0 ? Math.min(100, (raised / Number(org.goal)) * 100) : 0;
            return (
              <Card key={org.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/organizations/${org.id}`)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0 overflow-hidden" style={{ backgroundColor: org.image_color || "#333" }}>
                      {org.image_url ? <img src={resolveImageUrl(org.image_url)} alt="" className="h-full w-full object-cover" /> : (org.initials || org.name?.slice(0, 2).toUpperCase())}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{org.name}</p>
                      <p className="text-xs text-muted-foreground">{getCategoryName(org.category_id)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{org.description?.slice(0, 100)}</p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>${raised.toLocaleString()} raised</span>
                      <span>${Number(org.goal || 0).toLocaleString()} goal</span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {org.verified && <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-0.5" />Verified</Badge>}
                    {org.featured && <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]"><Star className="h-3 w-3 mr-0.5" />Featured</Badge>}
                    {!org.stripe_account_id ? (
                      <Badge variant="outline" className="text-muted-foreground border-border text-[10px]">No Stripe</Badge>
                    ) : org.payouts_enabled ? (
                      <Badge variant="outline" className="text-primary border-primary/30 text-[10px]">Stripe · Payouts on</Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-[10px]">Stripe · Onboarding</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {orgs.length === 0 && <p className="col-span-full text-center text-muted-foreground py-8">No organizations found</p>}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead className="hidden sm:table-cell">Category</TableHead>
                    <TableHead className="hidden sm:table-cell">Goal</TableHead>
                    <TableHead className="hidden sm:table-cell">Raised</TableHead>
                    <TableHead className="hidden md:table-cell">Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((org) => {
                    const raised = displayRaised(org);
                    const progress = Number(org.goal) > 0 ? Math.min(100, (raised / Number(org.goal)) * 100) : 0;
                    return (
                      <TableRow key={org.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/organizations/${org.id}`)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0 overflow-hidden" style={{ backgroundColor: org.image_color || "#333" }}>
                              {org.image_url ? <img src={resolveImageUrl(org.image_url)} alt="" className="h-full w-full object-cover" /> : (org.initials || org.name?.slice(0, 2).toUpperCase())}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{org.name}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{org.description?.slice(0, 60)}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">{getCategoryName(org.category_id)}</TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">${Number(org.goal || 0).toLocaleString()}</TableCell>
                        <TableCell className="hidden sm:table-cell font-medium text-primary">${raised.toLocaleString()}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <Progress value={progress} className="h-2 flex-1" />
                            <span className="text-xs text-muted-foreground w-10">{progress.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {org.verified && <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><CheckCircle2 className="h-3 w-3 mr-0.5" />Verified</Badge>}
                            {org.featured && <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Star className="h-3 w-3 mr-0.5" />Featured</Badge>}
                            {!org.stripe_account_id ? (
                              <Badge variant="outline" className="text-muted-foreground border-border">No Stripe</Badge>
                            ) : org.payouts_enabled ? (
                              <Badge variant="outline" className="text-primary border-primary/30">Stripe · Payouts on</Badge>
                            ) : (
                              <Badge variant="outline" className="text-amber-500 border-amber-500/30">Stripe · Onboarding</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); navigate(`/organizations/${org.id}`); }} title="View details">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); navigate(`/campaigns?org=${org.id}`); }} title="View campaigns">
                              <Megaphone className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); navigate(`/donations?org=${org.id}`); }} title="View donations">
                              <Heart className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {orgs.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No organizations found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

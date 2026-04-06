import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentRole } from "@/lib/admin-auth";
import { canAccessNav } from "@/lib/role-access";
import { dbQuery, fetchDonations, type EnrichedDonation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, Building2, Users, Heart, Trophy, Medal,
  ArrowUpRight, TrendingUp, Handshake, FileText,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { format, subDays, subMonths, parseISO, startOfMonth } from "date-fns";
import { useIsMobile } from "@/hooks/use-media-query";

interface KPI {
  totalDonations: number;
  totalOrgs: number;
  totalDonors: number;
  totalUsers: number;
  totalVolunteers: number;
  pendingRequests: number;
  communityCampaigns: number;
}

interface DashDonation {
  amount: string | number;
  user_email?: string;
  created_at?: string;
  category_id?: string;
  org_id?: string;
  donor_name?: string;
  org_name?: string;
  is_anonymous?: boolean;
  id?: string;
}

interface DashCategory {
  id: string;
  name: string;
}

interface DashOrg {
  name: string;
  raised: string | number;
  goal: string | number;
}

interface TopDonor {
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  totalAmount: number;
  donationCount: number;
}

const COLORS = [
  "hsl(152, 55%, 40%)", "hsl(45, 80%, 55%)", "hsl(210, 60%, 50%)",
  "hsl(340, 60%, 50%)", "hsl(280, 50%, 55%)", "hsl(20, 70%, 55%)",
  "hsl(170, 50%, 45%)", "hsl(60, 60%, 50%)",
];

const tooltipStyle = {
  backgroundColor: "hsl(207, 22%, 12%)",
  border: "1px solid hsl(207, 12%, 20%)",
  borderRadius: 8,
};
const tickStyle = { fontSize: 11, fill: "hsl(210, 12%, 55%)" };
const labelColor = { color: "hsl(210, 20%, 92%)" };

export default function Dashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const role = getCurrentRole();
  const chartHeight = isMobile ? 240 : 300;
  const chartHeightSm = isMobile ? 200 : 250;
  const pieOuter = isMobile ? 72 : 100;
  const [kpi, setKpi] = useState<KPI>({
    totalDonations: 0, totalOrgs: 0, totalDonors: 0, totalUsers: 0,
    totalVolunteers: 0, pendingRequests: 0, communityCampaigns: 0,
  });
  const [chartData, setChartData] = useState<{ date: string; amount: number }[]>([]);
  const [categoryData, setCategoryData] = useState<{ name: string; value: number }[]>([]);
  const [topOrgs, setTopOrgs] = useState<{ name: string; raised: number; goal: number }[]>([]);
  const [retentionData, setRetentionData] = useState<{ month: string; newDonors: number; returning: number }[]>([]);
  const [topDonors, setTopDonors] = useState<TopDonor[]>([]);
  const [recentDonations, setRecentDonations] = useState<EnrichedDonation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [donationsRes, volunteersCount, categoriesRes, allOrgsRes, requestsRes, commCampRes, orgsCountFull, usersCountRes] =
        await Promise.all([
          fetchDonations({ limit: 200 }),
          dbQuery("volunteers", { select: "id" }).then((r) => ({ count: r.data?.length ?? 0 })).catch(() => ({ count: 0 })),
          dbQuery<DashCategory>("categories", { select: "id, name" }),
          dbQuery<DashOrg>("organizations", { select: "id, name, raised, goal", order: { column: "raised", ascending: false }, limit: 8 }),
          dbQuery("charity_requests", { filters: [{ column: "status", op: "eq", value: "pending" }], select: "id" }).catch(() => ({ data: [] })),
          dbQuery("community_campaigns", { select: "id" }).catch(() => ({ data: [] })),
          dbQuery("organizations", { select: "id" }).catch(() => ({ data: [] })),
          dbQuery("users", { select: "id, role" }).catch(() => ({ data: [] })),
        ]);

      const donations: EnrichedDonation[] = donationsRes.donations || [];
      const categories = categoriesRes.data || [];
      const orgs = allOrgsRes.data || [];
      const totalDonations = donations.reduce((s: number, d: EnrichedDonation) => s + Number(d.amount), 0);
      const allUsers = (usersCountRes.data || []) as Array<{ id: string; role: string }>;
      const donorCount = allUsers.filter((u) => u.role === "donor").length || new Set(donations.map((d: EnrichedDonation) => d.user_email).filter(Boolean)).size;

      setKpi({
        totalDonations,
        totalOrgs: (orgsCountFull.data || []).length,
        totalDonors: donorCount,
        totalUsers: allUsers.length,
        totalVolunteers: volunteersCount.count,
        pendingRequests: (requestsRes.data || []).length,
        communityCampaigns: (commCampRes.data || []).length,
      });

      setRecentDonations(donations.slice(0, 5));

      const thirtyDaysAgo = subDays(new Date(), 30);
      const recent = donations.filter((d: EnrichedDonation) => d.created_at && new Date(d.created_at) >= thirtyDaysAgo);
      const grouped: Record<string, number> = {};
      for (let i = 0; i <= 30; i++) {
        grouped[format(subDays(new Date(), 30 - i), "MMM dd")] = 0;
      }
      recent.forEach((d: EnrichedDonation) => {
        const key = format(parseISO(d.created_at), "MMM dd");
        if (grouped[key] !== undefined) grouped[key] += Number(d.amount);
      });
      setChartData(Object.entries(grouped).map(([date, amount]) => ({ date, amount })));

      const catMap = Object.fromEntries(categories.map((c: DashCategory) => [c.id, c.name]));
      const byCat: Record<string, number> = {};
      donations.forEach((d: EnrichedDonation) => {
        const catName = catMap[d.category_id] || "Uncategorized";
        byCat[catName] = (byCat[catName] || 0) + Number(d.amount);
      });
      setCategoryData(
        Object.entries(byCat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      );

      setTopOrgs(orgs.map((o: DashOrg) => ({
        name: o.name?.length > 20 ? o.name.slice(0, 20) + "..." : o.name,
        raised: Number(o.raised || 0),
        goal: Number(o.goal || 0),
      })));

      const sixMonthsAgo = subMonths(new Date(), 6);
      const allPriorDonors = new Set<string>();
      donations.forEach((d: EnrichedDonation) => {
        if (d.user_email && d.created_at && new Date(d.created_at) < sixMonthsAgo) {
          allPriorDonors.add(d.user_email);
        }
      });

      const monthlyDonors: Record<string, Set<string>> = {};
      for (let i = 5; i >= 0; i--) {
        const monthStart = startOfMonth(subMonths(new Date(), i));
        monthlyDonors[format(monthStart, "MMM yyyy")] = new Set();
      }

      donations.forEach((d: EnrichedDonation) => {
        if (!d.user_email || !d.created_at) return;
        const dt = new Date(d.created_at);
        if (dt < sixMonthsAgo) return;
        const key = format(startOfMonth(dt), "MMM yyyy");
        if (monthlyDonors[key]) monthlyDonors[key].add(d.user_email);
      });

      const seenBefore = new Set(allPriorDonors);
      const retention: { month: string; newDonors: number; returning: number }[] = [];
      for (const [month, donors] of Object.entries(monthlyDonors)) {
        let returning = 0;
        let newD = 0;
        donors.forEach((email) => {
          if (seenBefore.has(email)) returning++;
          else newD++;
        });
        donors.forEach((email) => seenBefore.add(email));
        retention.push({ month, newDonors: newD, returning });
      }
      setRetentionData(retention);

      const donorMap: Record<string, { name: string; totalAmount: number; donationCount: number }> = {};
      donations.forEach((d: EnrichedDonation) => {
        const key = d.user_email || d.donor_name || "Anonymous";
        if (key === "Anonymous" && d.is_anonymous) return;
        const displayName = (d.donor_name && String(d.donor_name).trim()) || "Anonymous";
        if (!donorMap[key]) donorMap[key] = { name: displayName, totalAmount: 0, donationCount: 0 };
        donorMap[key].totalAmount += Number(d.amount);
        donorMap[key].donationCount += 1;
      });
      setTopDonors(
        Object.entries(donorMap)
          .map(([email, info]) => {
            const raw = info.name.trim();
            const sp = raw.indexOf(" ");
            const firstName = sp === -1 ? raw : raw.slice(0, sp);
            const lastName = sp === -1 ? "" : raw.slice(sp + 1).trim();
            return { email, name: info.name, firstName, lastName, totalAmount: info.totalAmount, donationCount: info.donationCount };
          })
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, 10),
      );
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const interval = setInterval(() => { load(); }, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const kpiCards = [
    { title: "Total Donations", value: `$${kpi.totalDonations.toLocaleString()}`, icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "Organizations", value: kpi.totalOrgs, icon: Building2, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Registered Users", value: kpi.totalUsers, icon: Users, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { title: "Donors", value: kpi.totalDonors, icon: Heart, color: "text-rose-500", bg: "bg-rose-500/10" },
    { title: "Pending Requests", value: kpi.pendingRequests, icon: FileText, color: "text-amber-500", bg: "bg-amber-500/10" },
    { title: "Community Campaigns", value: kpi.communityCampaigns, icon: Handshake, color: "text-cyan-500", bg: "bg-cyan-500/10" },
  ];

  if (loading) {
    return (
      <div className="space-y-6 w-full max-w-full min-w-0">
        <h2 className="text-xl sm:text-2xl font-bold">Dashboard</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 w-full max-w-full min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl sm:text-2xl font-bold">Dashboard</h2>
        <Button variant="outline" size="sm" onClick={load} className="w-full sm:w-auto shrink-0 touch-manipulation">
          <TrendingUp className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {canAccessNav(role, "/charity-requests") && (
          <Button size="sm" className="w-full min-[480px]:w-auto justify-center touch-manipulation" onClick={() => navigate("/charity-requests")}>
            <FileText className="h-4 w-4 mr-1 shrink-0" /> Review Requests {kpi.pendingRequests > 0 && `(${kpi.pendingRequests})`}
          </Button>
        )}
        {canAccessNav(role, "/organizations") && (
          <Button size="sm" variant="secondary" className="w-full min-[480px]:w-auto justify-center touch-manipulation" onClick={() => navigate("/organizations")}>
            <Building2 className="h-4 w-4 mr-1 shrink-0" /> Manage Orgs
          </Button>
        )}
        {canAccessNav(role, "/donations") && (
          <Button size="sm" variant="secondary" className="w-full min-[480px]:w-auto justify-center touch-manipulation" onClick={() => navigate("/donations")}>
            <DollarSign className="h-4 w-4 mr-1 shrink-0" /> View Donations
          </Button>
        )}
        {canAccessNav(role, "/users") && (
          <Button size="sm" variant="secondary" className="w-full min-[480px]:w-auto justify-center touch-manipulation" onClick={() => navigate("/users")}>
            <Users className="h-4 w-4 mr-1 shrink-0" /> Manage Users
          </Button>
        )}
        {canAccessNav(role, "/community-campaigns") && (
          <Button size="sm" variant="secondary" className="w-full min-[480px]:w-auto justify-center touch-manipulation" onClick={() => navigate("/community-campaigns")}>
            <Handshake className="h-4 w-4 mr-1 shrink-0" /> Campaigns
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {kpiCards.map((c) => (
          <Card key={c.title} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <div className={`h-9 w-9 rounded-lg ${c.bg} flex items-center justify-center`}>
                <c.icon className={`h-4 w-4 ${c.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Donations — Last 30 Days</CardTitle>
        </CardHeader>
        <CardContent className="pl-2 pr-0 sm:px-6">
          <div className="w-full min-w-0" style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: isMobile ? 0 : 4, bottom: isMobile ? 28 : 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(207, 12%, 20%)" />
                <XAxis
                  dataKey="date"
                  tick={tickStyle}
                  interval={isMobile ? 5 : 2}
                  angle={isMobile ? -40 : 0}
                  textAnchor={isMobile ? "end" : "middle"}
                  height={isMobile ? 48 : 32}
                />
                <YAxis tick={tickStyle} width={isMobile ? 36 : 44} tickFormatter={(v) => (isMobile && v >= 1000 ? `${v / 1000}k` : v)} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={labelColor} />
                <Bar dataKey="amount" fill="hsl(152, 55%, 40%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 min-w-0">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Donations by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length > 0 ? (
              <div className="w-full min-w-0" style={{ height: chartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={pieOuter}
                      innerRadius={isMobile ? 40 : 50}
                      paddingAngle={2}
                      label={
                        isMobile
                          ? false
                          : ({ name, percent }) => `${String(name).slice(0, 12)}${String(name).length > 12 ? "…" : ""} ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} labelStyle={labelColor} formatter={(value: number) => `$${value.toLocaleString()}`} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "hsl(210, 12%, 55%)" }} verticalAlign="bottom" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] sm:h-[300px] text-muted-foreground text-sm">No category data</div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Organizations by Raised</CardTitle>
          </CardHeader>
          <CardContent className="pl-1 sm:pl-6 pr-0 sm:pr-6">
            {topOrgs.length > 0 ? (
              <div className="w-full min-w-0" style={{ height: chartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topOrgs} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(207, 12%, 20%)" horizontal={false} />
                    <XAxis type="number" tick={tickStyle} tickFormatter={(v) => (isMobile && v >= 1000 ? `${v / 1000}k` : v)} />
                    <YAxis type="category" dataKey="name" tick={{ ...tickStyle, fontSize: 10 }} width={isMobile ? 88 : 118} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={labelColor} formatter={(value: number) => `$${value.toLocaleString()}`} />
                    <Bar dataKey="raised" fill="hsl(152, 55%, 40%)" radius={[0, 4, 4, 0]} name="Raised" />
                    <Bar dataKey="goal" fill="hsl(207, 12%, 25%)" radius={[0, 4, 4, 0]} name="Goal" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] sm:h-[300px] text-muted-foreground text-sm">No organization data</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 min-w-0">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Donor Retention — Last 6 Months</CardTitle>
          </CardHeader>
          <CardContent className="pl-2 pr-0 sm:px-6">
            {retentionData.length > 0 ? (
              <div className="w-full min-w-0" style={{ height: chartHeightSm }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={retentionData} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(207, 12%, 20%)" />
                    <XAxis dataKey="month" tick={tickStyle} interval={isMobile ? 1 : 0} angle={isMobile ? -25 : 0} textAnchor={isMobile ? "end" : "middle"} height={isMobile ? 40 : 30} />
                    <YAxis tick={tickStyle} width={isMobile ? 28 : 36} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={labelColor} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="returning" stroke="hsl(152, 55%, 40%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(152, 55%, 40%)" }} name="Returning" />
                    <Line type="monotone" dataKey="newDonors" stroke="hsl(45, 80%, 55%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(45, 80%, 55%)" }} name="New" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">No retention data</div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Donations</CardTitle>
            <Button variant="ghost" size="sm" className="self-start sm:self-auto touch-manipulation" onClick={() => navigate("/donations")}>
              View All <ArrowUpRight className="h-3 w-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentDonations.length > 0 ? (
              <div className="space-y-3">
                {recentDonations.map((d: EnrichedDonation) => (
                  <div key={d.id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{d.donor_name || d.user_email || "Anonymous"}</p>
                      <p className="text-xs text-muted-foreground truncate">{d.org_name}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-semibold text-emerald-500">${Number(d.amount).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{d.created_at ? format(new Date(d.created_at), "MMM d") : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No recent donations</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Trophy className="h-4 w-4 text-emerald-500 shrink-0" /> Top Donors — Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {topDonors.length > 0 ? (
            <div className="overflow-x-auto overscroll-x-contain touch-pan-x">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 sm:w-12 text-xs sm:text-sm">Rank</TableHead>
                    <TableHead className="text-xs sm:text-sm min-w-[7rem]">Donor</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm whitespace-nowrap">Donations</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm whitespace-nowrap">Total Given</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topDonors.map((donor, i) => (
                    <TableRow key={donor.email} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/donors/${encodeURIComponent(donor.email)}`)}>
                      <TableCell>
                        {i === 0 ? (
                          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Medal className="h-3 w-3 mr-1" />1st</Badge>
                        ) : i === 1 ? (
                          <Badge variant="secondary" className="bg-slate-400/20 text-slate-300"><Medal className="h-3 w-3 mr-1" />2nd</Badge>
                        ) : i === 2 ? (
                          <Badge variant="secondary" className="bg-amber-700/20 text-amber-500"><Medal className="h-3 w-3 mr-1" />3rd</Badge>
                        ) : (
                          <span className="text-muted-foreground ml-2">{i + 1}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {donor.lastName ? (
                          <div>
                            <div>{donor.firstName}</div>
                            <div className="text-xs text-muted-foreground">{donor.lastName}</div>
                          </div>
                        ) : (
                          donor.firstName || donor.name
                        )}
                      </TableCell>
                      <TableCell className="text-right">{donor.donationCount}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-500">${donor.totalAmount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No donor data yet</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

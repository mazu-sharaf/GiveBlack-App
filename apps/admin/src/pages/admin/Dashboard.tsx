import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentName, getCurrentRole } from "@/lib/admin-auth";
import { canAccessNav } from "@/lib/role-access";
import {
  dbQuery,
  fetchDonations,
  fetchPaymentMetrics,
  fetchTopDonorsAdmin,
  resolveImageUrl,
  type AdminTopDonorRow,
  type AdminPaymentMetrics,
  type EnrichedDonation,
} from "@/lib/api";
import { placeholderDonorPhoto } from "@/lib/donor-placeholder-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  DollarSign,
  FileText,
  Handshake,
  Heart,
  LayoutDashboard,
  Medal,
  MoreVertical,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO, startOfMonth, subDays, subMonths } from "date-fns";
import { useIsMobile } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

interface KPI {
  totalDonations: number;
  totalOrgs: number;
  totalDonors: number;
  totalUsers: number;
  totalVolunteers: number;
  pendingRequests: number;
  communityCampaigns: number;
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
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  avatar_url: string | null;
  totalAmount: number;
  donationCount: number;
}

/** When no `donor_stats` rows yet (guests / unlinked), rank from the donations sample like before. */
function buildTopDonorsFromDonationsSample(donations: EnrichedDonation[]): TopDonor[] {
  const donorMap: Record<string, { name: string; totalAmount: number; donationCount: number }> = {};
  donations.forEach((d: EnrichedDonation) => {
    const key = d.user_email || d.donor_name || "Anonymous";
    if (key === "Anonymous" && d.is_anonymous) return;
    const displayName = (d.donor_name && String(d.donor_name).trim()) || "Anonymous";
    if (!donorMap[key]) donorMap[key] = { name: displayName, totalAmount: 0, donationCount: 0 };
    donorMap[key].totalAmount += Number(d.amount);
    donorMap[key].donationCount += 1;
  });
  return Object.entries(donorMap)
    .map(([rowKey, info]) => {
      const raw = info.name.trim();
      const sp = raw.indexOf(" ");
      const firstName = sp === -1 ? raw : raw.slice(0, sp);
      const lastName = sp === -1 ? "" : raw.slice(sp + 1).trim();
      return {
        id: `sample-${rowKey}`,
        email: rowKey.includes("@") ? rowKey : "",
        name: info.name,
        firstName,
        lastName,
        avatar_url: placeholderDonorPhoto(rowKey, firstName, lastName),
        totalAmount: info.totalAmount,
        donationCount: info.donationCount,
      };
    })
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 20);
}

const CHART = {
  gridStroke: "hsl(156, 18%, 26%)",
  axisTick: "#b8d4c4",
  labelColor: "#ecf8f0",
  tooltipBg: "hsl(158, 36%, 11%)",
  tooltipBorder: "hsl(156, 22%, 28%)",
  barMuted: "hsl(156, 14%, 24%)",
  lineA: "hsl(152, 55%, 48%)",
  lineB: "hsl(88, 52%, 56%)",
};

const PIE_COLORS = [
  "hsl(152, 55%, 42%)",
  "hsl(145, 48%, 46%)",
  "hsl(138, 42%, 50%)",
  "hsl(165, 45%, 44%)",
  "hsl(100, 40%, 48%)",
  "hsl(172, 38%, 42%)",
  "hsl(125, 42%, 46%)",
  "hsl(158, 36%, 40%)",
];

const tooltipStyle = {
  backgroundColor: CHART.tooltipBg,
  border: `1px solid ${CHART.tooltipBorder}`,
  borderRadius: 10,
};
const tickStyle = { fontSize: 11, fill: CHART.axisTick };
const labelColor = { color: CHART.labelColor };
const legendStyle = { fontSize: 11, color: CHART.axisTick };

function sum(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0);
}

function halfDelta(values: number[]): { pct: number; up: boolean } {
  if (values.length < 4) return { pct: 0, up: true };
  const mid = Math.floor(values.length / 2);
  const a = sum(values.slice(0, mid));
  const b = sum(values.slice(mid));
  if (a === 0) return { pct: b > 0 ? 100 : 0, up: true };
  const pct = Math.round(((b - a) / a) * 1000) / 10;
  return { pct: Math.abs(pct), up: pct >= 0 };
}

function toSpark(values: number[], take = 12): { i: number; v: number }[] {
  const slice = values.slice(-take);
  return slice.map((v, i) => ({ i, v }));
}

function DeltaBadge({ up, pct }: { up: boolean; pct: number }) {
  if (pct === 0) return <span className="text-xs text-muted-foreground">-</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-xs font-semibold",
        up ? "bg-primary/15 text-primary" : "bg-rose-500/15 text-rose-300"
      )}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {pct}%
    </span>
  );
}

function SparkArea({ data, gradId }: { data: { i: number; v: number }[]; gradId: string }) {
  if (data.length === 0) return <div className="h-14 w-full rounded-md bg-white/5" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(152, 60%, 50%)" stopOpacity={0.85} />
            <stop offset="100%" stopColor="hsl(152, 55%, 38%)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke="hsl(152, 55%, 45%)" strokeWidth={1.5} fill={`url(#${gradId})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function SparkLine({ data, color }: { data: { i: number; v: number }[]; color: string }) {
  if (data.length === 0) return <div className="h-14 w-full rounded-md bg-white/5" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SparkBars({ data, gradId }: { data: { n: string; v: number }[]; gradId: string }) {
  if (data.length === 0) return <div className="h-16 w-full rounded-md bg-white/5" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(300, 55%, 55%)" />
            <stop offset="100%" stopColor="hsl(152, 55%, 40%)" />
          </linearGradient>
        </defs>
        <Bar dataKey="v" fill={`url(#${gradId})`} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function StatLineCard({
  title,
  value,
  delta,
  spark,
  gradId,
}: {
  title: string;
  value: string;
  delta: { pct: number; up: boolean };
  spark: { i: number; v: number }[];
  gradId: string;
}) {
  return (
    <Card className="rounded-2xl border-white/10 shadow-md">
      <CardContent className="p-4 pt-5">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="text-2xl font-bold tracking-tight text-foreground">{value}</h3>
          <DeltaBadge up={delta.up} pct={delta.pct} />
        </div>
        <p className="mb-3 text-sm text-muted-foreground">{title}</p>
        <div className="h-16 w-full min-w-0">
          <SparkArea data={spark} gradId={gradId} />
        </div>
      </CardContent>
    </Card>
  );
}

function GoalProgressCard({
  title,
  amountLabel,
  pct,
  barClass,
}: {
  title: string;
  amountLabel: string;
  pct: number;
  barClass: string;
}) {
  const left = Math.max(0, Math.min(100, pct));
  return (
    <Card className="rounded-2xl border-white/10 shadow-md">
      <CardContent className="p-4 pt-5">
        <h3 className="mb-1 text-2xl font-bold tracking-tight text-foreground">{amountLabel}</h3>
        <p className="mb-4 text-sm text-muted-foreground">{title}</p>
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress to goal</span>
            <span className="font-semibold text-foreground">{Math.round(left)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className={cn("h-full rounded-full transition-all", barClass)} style={{ width: `${left}%` }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniWidget({
  title,
  subtitle,
  footnote,
  children,
}: {
  title: string;
  subtitle: string;
  footnote: React.ReactNode;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <Card className="flex h-full min-h-[11rem] flex-col rounded-2xl border-white/10 shadow-md">
      <CardContent className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h5 className="text-lg font-bold text-foreground">{title}</h5>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => navigate("/donations")}>View donations</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/organizations")}>Organizations</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
        <div className="mt-2 text-center text-xs text-muted-foreground">{footnote}</div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const uid = useId().replace(/:/g, "");
  const role = getCurrentRole();
  const adminName = getCurrentName() || "Admin";

  const chartMainH = isMobile ? 240 : 300;
  const chartMidH = isMobile ? 220 : 280;
  const pieOuter = isMobile ? 70 : 96;

  const [kpi, setKpi] = useState<KPI>({
    totalDonations: 0,
    totalOrgs: 0,
    totalDonors: 0,
    totalUsers: 0,
    totalVolunteers: 0,
    pendingRequests: 0,
    communityCampaigns: 0,
  });
  const [chartData, setChartData] = useState<{ date: string; amount: number }[]>([]);
  const [categoryData, setCategoryData] = useState<{ name: string; value: number }[]>([]);
  const [topOrgs, setTopOrgs] = useState<{ name: string; raised: number; goal: number }[]>([]);
  const [retentionData, setRetentionData] = useState<{ month: string; newDonors: number; returning: number }[]>([]);
  const [topDonors, setTopDonors] = useState<TopDonor[]>([]);
  const [recentDonations, setRecentDonations] = useState<EnrichedDonation[]>([]);
  const [payMetrics, setPayMetrics] = useState<AdminPaymentMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [donationsRes, topDonorsRes, volunteersCount, categoriesRes, allOrgsRes, requestsRes, commCampRes, orgsCountFull, usersCountRes, payRes] =
        await Promise.all([
          fetchDonations({ limit: 200 }),
          fetchTopDonorsAdmin(20).catch(() => ({ donors: [] as AdminTopDonorRow[] })),
          dbQuery("volunteers", { select: "id" })
            .then((r) => ({ count: r.data?.length ?? 0 }))
            .catch(() => ({ count: 0 })),
          dbQuery<DashCategory>("categories", { select: "id, name" }),
          dbQuery<DashOrg>("organizations", {
            select: "id, name, raised, goal",
            order: { column: "raised", ascending: false },
            limit: 8,
          }),
          dbQuery("charity_requests", { filters: [{ column: "status", op: "eq", value: "pending" }], select: "id" }).catch(() => ({ data: [] })),
          dbQuery("community_campaigns", { select: "id" }).catch(() => ({ data: [] })),
          dbQuery("organizations", { select: "id" }).catch(() => ({ data: [] })),
          dbQuery("users", { select: "id, role" }).catch(() => ({ data: [] })),
          fetchPaymentMetrics("all_time").catch(() => null),
        ]);

      const donations: EnrichedDonation[] = donationsRes.donations || [];
      const categories = categoriesRes.data || [];
      const orgs = allOrgsRes.data || [];
      const totalDonations = donations.reduce((s: number, d: EnrichedDonation) => s + Number(d.amount), 0);
      const allUsers = (usersCountRes.data || []) as Array<{ id: string; role: string }>;
      const donorCount =
        allUsers.filter((u) => u.role === "donor").length ||
        new Set(donations.map((d: EnrichedDonation) => d.user_email).filter(Boolean)).size;

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
        const key = format(parseISO(d.created_at!), "MMM dd");
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
        Object.entries(byCat)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value),
      );

      setTopOrgs(
        orgs.map((o: DashOrg) => ({
          name: o.name?.length > 22 ? `${o.name.slice(0, 22)}…` : o.name || "Org",
          raised: Number(o.raised || 0),
          goal: Number(o.goal || 0),
        })),
      );

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

      const apiTopDonors: TopDonor[] = (topDonorsRes.donors || []).map((d) => ({
        id: d.id,
        email: d.email || "",
        name: d.name,
        firstName: d.first_name,
        lastName: d.last_name,
        avatar_url: d.avatar_url,
        totalAmount: d.total_amount_cents / 100,
        donationCount: d.donation_count,
      }));
      setTopDonors(
        apiTopDonors.length > 0 ? apiTopDonors : buildTopDonorsFromDonationsSample(donations)
      );
      if (payRes) setPayMetrics(payRes);
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => load(), 30000);
    return () => clearInterval(interval);
  }, [load]);

  const amounts = useMemo(() => chartData.map((d) => d.amount), [chartData]);
  const donationDelta = useMemo(() => halfDelta(amounts), [amounts]);
  const donorSpark = useMemo(() => toSpark(retentionData.map((r) => r.newDonors + r.returning), 8), [retentionData]);
  const userSpark = useMemo(() => toSpark(retentionData.map((r) => r.returning), 8), [retentionData]);
  const catBars = useMemo(
    () => categoryData.slice(0, 5).map((c) => ({ n: c.name.slice(0, 8), v: c.value })),
    [categoryData],
  );

  const goalCards = useMemo(() => {
    const withGoals = topOrgs.filter((o) => Number(o.goal) > 0).slice(0, 3);
    if (withGoals.length >= 3) {
      return withGoals.map((o) => ({
        title: `${o.name}: goal progress`,
        amountLabel: `$${Number(o.raised).toLocaleString()}`,
        pct: Math.min(100, Math.round((Number(o.raised) / Number(o.goal)) * 100)),
      }));
    }
    const base = [
      { title: "Organizations on platform", amountLabel: String(kpi.totalOrgs), pct: Math.min(100, kpi.totalOrgs * 5) },
      { title: "Donor community", amountLabel: String(kpi.totalDonors), pct: Math.min(100, kpi.totalDonors * 2) },
      { title: "Volunteer pipeline", amountLabel: String(kpi.totalVolunteers), pct: Math.min(100, 40 + kpi.totalVolunteers * 3) },
    ];
    return base;
  }, [topOrgs, kpi]);

  const radialEngagement = useMemo(() => {
    if (!kpi.totalUsers) return 0;
    return Math.min(100, Math.round((kpi.totalDonors / Math.max(kpi.totalUsers, 1)) * 100));
  }, [kpi]);

  const radialData = useMemo(
    () => [{ name: "eng", value: radialEngagement, fill: "hsl(152, 55%, 44%)" }],
    [radialEngagement],
  );

  const avgDaily = amounts.length > 0 ? Math.round(sum(amounts) / 31) : 0;
  const avgDelta = useMemo(() => halfDelta(amounts.map((v) => v || 0)), [amounts]);

  if (loading) {
    return (
      <div className="min-w-0 max-w-full space-y-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid gap-4 lg:grid-cols-12">
          <Skeleton className="h-48 rounded-2xl lg:col-span-7" />
          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-5">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const barGradId = `dash-bar-${uid}`;
  const pieInner = isMobile ? 44 : 56;

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-2 sm:space-y-6">
      {/* Page header: Maxton-style title row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Overview</p>
          <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            <LayoutDashboard className="h-7 w-7 text-primary" />
            Dashboard
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="rounded-lg border-white/15" onClick={load}>
            <TrendingUp className="mr-1 h-4 w-4" /> Refresh
          </Button>
          {canAccessNav(role, "/settings") && (
            <Button size="sm" className="rounded-lg" onClick={() => navigate("/settings")}>
              Settings
            </Button>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {canAccessNav(role, "/charity-requests") && (
          <Button size="sm" className="w-full rounded-xl" onClick={() => navigate("/charity-requests")}>
            <FileText className="mr-1 h-4 w-4 shrink-0" /> Requests {kpi.pendingRequests > 0 && `(${kpi.pendingRequests})`}
          </Button>
        )}
        {canAccessNav(role, "/organizations") && (
          <Button size="sm" variant="secondary" className="w-full rounded-xl" onClick={() => navigate("/organizations")}>
            <Building2 className="mr-1 h-4 w-4 shrink-0" /> Organizations
          </Button>
        )}
        {canAccessNav(role, "/donations") && (
          <Button size="sm" variant="secondary" className="w-full rounded-xl" onClick={() => navigate("/donations")}>
            <DollarSign className="mr-1 h-4 w-4 shrink-0" /> Donations
          </Button>
        )}
        {canAccessNav(role, "/users") && (
          <Button size="sm" variant="secondary" className="w-full rounded-xl" onClick={() => navigate("/users")}>
            <Users className="mr-1 h-4 w-4 shrink-0" /> Users
          </Button>
        )}
        {canAccessNav(role, "/community-campaigns") && (
          <Button size="sm" variant="secondary" className="w-full rounded-xl" onClick={() => navigate("/community-campaigns")}>
            <Handshake className="mr-1 h-4 w-4 shrink-0" /> Community
          </Button>
        )}
      </div>

      {/* Welcome + side metrics */}
      <div className="grid gap-4 lg:grid-cols-12 lg:items-stretch">
        <Card className="overflow-hidden rounded-2xl border-white/10 shadow-lg lg:col-span-7">
          <CardContent className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/20 text-lg font-bold text-primary">
                  {adminName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Signed in as</p>
                  <h2 className="text-xl font-bold text-foreground sm:text-2xl">Welcome back, {adminName.split(" ")[0]}!</h2>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-xs text-muted-foreground">30-day volume</p>
                  <p className="text-lg font-bold text-primary">${sum(amounts).toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-xs text-muted-foreground">Active donors</p>
                  <p className="text-lg font-bold text-foreground">{kpi.totalDonors.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="relative mx-auto flex h-36 w-full max-w-[220px] shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/20 via-transparent to-teal-500/10 sm:h-40 sm:max-w-[260px]">
              <Sparkles className="absolute right-3 top-3 h-6 w-6 text-primary/60" />
              <Heart className="h-16 w-16 text-primary sm:h-20 sm:w-20" strokeWidth={1.25} />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:col-span-5">
          <Card className="rounded-2xl border-white/10 shadow-md">
            <CardContent className="space-y-2 p-4">
              <p className="text-xs text-muted-foreground">Engagement</p>
              <p className="text-xl font-bold text-foreground">{radialEngagement}%</p>
              <div className="mx-auto h-24 w-24">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart cx="50%" cy="50%" innerRadius="68%" outerRadius="100%" data={radialData} startAngle={90} endAngle={-270}>
                    <RadialBar background={{ fill: "hsl(156, 20%, 16%)" }} dataKey="value" cornerRadius={6} />
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-white/10 shadow-md">
            <CardContent className="space-y-2 p-4">
              <p className="text-xs text-muted-foreground">Donor activity</p>
              <p className="text-xl font-bold text-foreground">{kpi.totalUsers.toLocaleString()}</p>
              <div className="h-20 w-full">
                <SparkLine data={userSpark} color="hsl(88, 55%, 58%)" />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-white/10 shadow-md">
            <CardContent className="space-y-2 p-4">
              <p className="text-xs text-muted-foreground">Community</p>
              <p className="text-xl font-bold text-foreground">{kpi.communityCampaigns}</p>
              <div className="h-20 w-full">
                <SparkArea data={toSpark(amounts, 10)} gradId={`${uid}-wc`} />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-white/10 shadow-md">
            <CardContent className="space-y-2 p-4">
              <p className="text-xs text-muted-foreground">Volunteers</p>
              <p className="text-xl font-bold text-foreground">{kpi.totalVolunteers}</p>
              <div className="h-20 w-full">
                <SparkLine data={donorSpark} color="hsl(152, 55%, 50%)" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Row: 3 stat + area sparklines (widgets-data style) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatLineCard
          title="Total donations (all time)"
          value={`$${kpi.totalDonations.toLocaleString()}`}
          delta={donationDelta}
          spark={toSpark(amounts, 14)}
          gradId={`${uid}-s1`}
        />
        <StatLineCard
          title="Registered users"
          value={kpi.totalUsers.toLocaleString()}
          delta={halfDelta(retentionData.map((r) => r.returning + r.newDonors))}
          spark={userSpark}
          gradId={`${uid}-s2`}
        />
        <StatLineCard
          title="Avg. daily (30d window)"
          value={`$${avgDaily.toLocaleString()}`}
          delta={avgDelta}
          spark={toSpark(amounts, 14)}
          gradId={`${uid}-s3`}
        />
      </div>

      {/* Payments separation */}
      {payMetrics ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card className="rounded-2xl border-white/10 shadow-md">
            <CardContent className="p-4 pt-5">
              <p className="text-xs text-muted-foreground">Subscription payments (all time)</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                ${Number(payMetrics.subscriptions.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{payMetrics.subscriptions.payment_count} payment(s)</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-white/10 shadow-md">
            <CardContent className="p-4 pt-5">
              <p className="text-xs text-muted-foreground">Platform fee (3%) from donations (all time)</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                ${Number(payMetrics.donations.platform_fee_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Based on succeeded donation volume</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-white/10 shadow-md">
            <CardContent className="p-4 pt-5">
              <p className="text-xs text-muted-foreground">Education reinvest (all time)</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                ${Number(payMetrics.donations.education_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Partner: ${Number(payMetrics.donations.education_partner_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ·
                General: ${Number(payMetrics.donations.education_general_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-white/10 shadow-md">
            <CardContent className="p-4 pt-5">
              <p className="text-xs text-muted-foreground">Donations gross (all time)</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                ${Number(payMetrics.donations.gross_total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{payMetrics.donations.donation_count} donation(s)</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-white/10 shadow-md">
            <CardContent className="p-4 pt-5">
              <p className="text-xs text-muted-foreground">To orgs (before processor) (all time)</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                ${Number(payMetrics.donations.to_orgs_before_processor || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Gross − platform fee − education</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-white/10 shadow-md">
            <CardContent className="p-4 pt-5">
              <p className="text-xs text-muted-foreground">Ledger totals (all time)</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Platform: <span className="font-semibold text-foreground">${Number(payMetrics.ledger.platform || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                {" · "}Org: <span className="font-semibold text-foreground">${Number(payMetrics.ledger.org || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ecosystem: <span className="font-semibold text-foreground">${Number(payMetrics.ledger.ecosystem || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                {" · "}Endowment: <span className="font-semibold text-foreground">${Number(payMetrics.ledger.endowment || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Row: goal progress (3 cards) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <GoalProgressCard
          title={goalCards[0]?.title ?? "Progress"}
          amountLabel={goalCards[0]?.amountLabel ?? "-"}
          pct={goalCards[0]?.pct ?? 0}
          barClass="bg-gradient-to-r from-teal-500 to-primary"
        />
        <GoalProgressCard
          title={goalCards[1]?.title ?? "Progress"}
          amountLabel={goalCards[1]?.amountLabel ?? "-"}
          pct={goalCards[1]?.pct ?? 0}
          barClass="bg-gradient-to-r from-fuchsia-500 to-rose-500"
        />
        <GoalProgressCard
          title={goalCards[2]?.title ?? "Progress"}
          amountLabel={goalCards[2]?.amountLabel ?? "-"}
          pct={goalCards[2]?.pct ?? 0}
          barClass="bg-gradient-to-r from-primary to-lime-400"
        />
      </div>

      {/* Main charts row */}
      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
        <Card className="flex min-w-0 flex-col overflow-hidden rounded-2xl border-white/10 shadow-lg">
          <CardHeader className="border-b border-white/5 pb-3">
            <CardTitle className="text-base font-semibold text-foreground">Donations, last 30 days</CardTitle>
            <p className="text-xs text-muted-foreground">Daily totals in your connected environment</p>
          </CardHeader>
          <CardContent className="flex-1 px-2 pt-4 sm:px-4">
            <div className="h-[240px] w-full min-w-0 sm:h-[300px]" style={{ height: chartMainH }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: isMobile ? 0 : 4, bottom: isMobile ? 28 : 8 }}>
                  <defs>
                    <linearGradient id={barGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(172, 65%, 52%)" />
                      <stop offset="100%" stopColor="hsl(152, 55%, 36%)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.gridStroke} />
                  <XAxis
                    dataKey="date"
                    tick={tickStyle}
                    interval={isMobile ? 5 : 2}
                    angle={isMobile ? -40 : 0}
                    textAnchor={isMobile ? "end" : "middle"}
                    height={isMobile ? 48 : 32}
                  />
                  <YAxis tick={tickStyle} width={isMobile ? 36 : 44} tickFormatter={(v) => (isMobile && v >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={labelColor} formatter={(v: number) => [`$${Number(v).toLocaleString()}`, "Amount"]} />
                  <Bar dataKey="amount" fill={`url(#${barGradId})`} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-w-0 flex-col overflow-hidden rounded-2xl border-white/10 shadow-lg">
          <CardHeader className="border-b border-white/5 pb-3">
            <CardTitle className="text-base font-semibold text-foreground">Donations by category</CardTitle>
            <p className="text-xs text-muted-foreground">Share of recorded donation volume</p>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col px-2 pt-2 sm:px-4">
            {categoryData.length > 0 ? (
              <div className="h-[240px] w-full min-w-0 flex-1 sm:h-[300px]" style={{ height: chartMainH }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={pieOuter}
                      innerRadius={pieInner}
                      paddingAngle={2}
                      label={
                        isMobile
                          ? false
                          : ({ name, percent }) =>
                              `${String(name).slice(0, 10)}${String(name).length > 10 ? "…" : ""} ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} labelStyle={labelColor} formatter={(value: number) => `$${value.toLocaleString()}`} />
                    <Legend wrapperStyle={legendStyle} verticalAlign="bottom" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">No category data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top orgs + retention + recent */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden rounded-2xl border-white/10 shadow-lg">
          <CardHeader className="border-b border-white/5 pb-2">
            <CardTitle className="text-base font-semibold text-foreground">Top organizations by raised</CardTitle>
          </CardHeader>
          <CardContent className="px-1 pt-4 sm:px-4">
            {topOrgs.length > 0 ? (
              <div className="h-[260px] w-full min-w-0" style={{ height: chartMidH }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topOrgs} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
                    <defs>
                      <linearGradient id={`${uid}-horiz`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="hsl(152, 55%, 38%)" />
                        <stop offset="100%" stopColor="hsl(172, 55%, 48%)" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.gridStroke} horizontal={false} />
                    <XAxis type="number" tick={tickStyle} tickFormatter={(v) => (isMobile && v >= 1000 ? `${v / 1000}k` : v)} />
                    <YAxis type="category" dataKey="name" tick={{ ...tickStyle, fontSize: 10 }} width={isMobile ? 88 : 120} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={labelColor} formatter={(value: number) => `$${value.toLocaleString()}`} />
                    <Bar dataKey="raised" fill={`url(#${uid}-horiz)`} radius={[0, 6, 6, 0]} name="Raised" />
                    <Bar dataKey="goal" fill={CHART.barMuted} radius={[0, 6, 6, 0]} name="Goal" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">No organization data</div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="overflow-hidden rounded-2xl border-white/10 shadow-lg">
            <CardHeader className="border-b border-white/5 pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">Donor retention, 6 months</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pt-4 sm:px-4">
              {retentionData.length > 0 ? (
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={retentionData} margin={{ left: 0, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART.gridStroke} />
                      <XAxis
                        dataKey="month"
                        tick={tickStyle}
                        interval={isMobile ? 1 : 0}
                        angle={isMobile ? -25 : 0}
                        textAnchor={isMobile ? "end" : "middle"}
                        height={isMobile ? 40 : 30}
                      />
                      <YAxis tick={tickStyle} width={isMobile ? 28 : 36} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={labelColor} />
                      <Legend wrapperStyle={legendStyle} />
                      <Line type="monotone" dataKey="returning" stroke={CHART.lineA} strokeWidth={2} dot={{ r: 3, fill: CHART.lineA }} name="Returning" />
                      <Line type="monotone" dataKey="newDonors" stroke={CHART.lineB} strokeWidth={2} dot={{ r: 3, fill: CHART.lineB }} name="New" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">No retention data</div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-white/10 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">Recent donations</CardTitle>
              <Button variant="ghost" size="sm" className="h-8 text-primary" onClick={() => navigate("/donations")}>
                View all <ArrowUpRight className="ml-0.5 h-3 w-3" />
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              {recentDonations.length > 0 ? (
                <div className="space-y-3">
                  {recentDonations.map((d: EnrichedDonation) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{d.donor_name || d.user_email || "Anonymous"}</p>
                        <p className="truncate text-xs text-muted-foreground">{d.org_name}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold text-primary">${Number(d.amount).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{d.created_at ? format(new Date(d.created_at), "MMM d") : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No recent donations</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Six mini widgets: data widgets row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MiniWidget
          title={kpi.totalUsers.toLocaleString()}
          subtitle="Total users"
          footnote={
            <span>
              <span className="text-primary">Live</span> directory
            </span>
          }
        >
          <div className="h-20 w-full">
            <SparkArea data={userSpark} gradId={`${uid}-m1`} />
          </div>
        </MiniWidget>
        <MiniWidget
          title={kpi.totalDonors.toLocaleString()}
          subtitle="Donors"
          footnote={<span className="text-primary">Giving community</span>}
        >
          <div className="h-20 w-full">
            <SparkLine data={donorSpark} color="hsl(152, 55%, 50%)" />
          </div>
        </MiniWidget>
        <MiniWidget
          title={kpi.totalOrgs.toLocaleString()}
          subtitle="Organizations"
          footnote={<span>On platform</span>}
        >
          <div className="h-20 w-full">
            <SparkBars data={catBars} gradId={`${uid}-m3`} />
          </div>
        </MiniWidget>
        <MiniWidget
          title={kpi.pendingRequests.toString()}
          subtitle="Pending requests"
          footnote={<span className="text-amber-300/90">Needs review</span>}
        >
          <div className="h-20 w-full">
            <SparkLine data={toSpark(chartData.map((d) => d.amount).slice(0, 10), 8)} color="hsl(38, 92%, 60%)" />
          </div>
        </MiniWidget>
        <MiniWidget
          title={kpi.communityCampaigns.toString()}
          subtitle="Community campaigns"
          footnote={<span className="text-teal-300/90">Programs</span>}
        >
          <div className="h-20 w-full">
            <SparkArea data={toSpark(amounts, 10)} gradId={`${uid}-m5`} />
          </div>
        </MiniWidget>
        <MiniWidget
          title={kpi.totalVolunteers.toString()}
          subtitle="Volunteers"
          footnote={<span className="text-primary">Engagement</span>}
        >
          <div className="h-20 w-full">
            <SparkLine data={toSpark(retentionData.map((r) => r.newDonors), 8)} color="hsl(88, 55%, 58%)" />
          </div>
        </MiniWidget>
      </div>

      {/* Leaderboard */}
      <Card className="overflow-hidden rounded-2xl border-white/10 shadow-lg">
        <CardHeader className="border-b border-white/5">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Trophy className="h-5 w-5 text-primary" />
            Top donors
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Top 20 by lifetime giving for registered accounts when available; otherwise top givers from recent donations in this view (guests count here).
          </p>
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:px-4">
          {topDonors.length > 0 ? (
            <div className="gb-admin-scrollable max-h-[min(28rem,50vh)] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-xs text-muted-foreground sm:text-sm">Rank</TableHead>
                    <TableHead className="min-w-[10rem] text-xs text-muted-foreground sm:text-sm">Donor</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs text-muted-foreground sm:text-sm">#</TableHead>
                    <TableHead className="whitespace-nowrap text-right text-xs text-muted-foreground sm:text-sm">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topDonors.map((donor, i) => (
                    <TableRow
                      key={donor.id}
                      className={`border-white/5 hover:bg-white/[0.04] ${donor.email ? "cursor-pointer" : ""}`}
                      onClick={() => {
                        if (donor.email) navigate(`/donors/${encodeURIComponent(donor.email)}`);
                      }}
                    >
                      <TableCell>
                        {i === 0 ? (
                          <Badge className="border-yellow-500/40 bg-yellow-500/15 text-yellow-300">
                            <Medal className="mr-1 h-3 w-3" />
                            1st
                          </Badge>
                        ) : i === 1 ? (
                          <Badge variant="secondary" className="border-white/15 bg-white/10 text-foreground">
                            <Medal className="mr-1 h-3 w-3" />
                            2nd
                          </Badge>
                        ) : i === 2 ? (
                          <Badge variant="secondary" className="border-amber-600/40 bg-amber-900/30 text-amber-300">
                            <Medal className="mr-1 h-3 w-3" />
                            3rd
                          </Badge>
                        ) : (
                          <span className="ml-2 text-muted-foreground">{i + 1}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={resolveImageUrl(donor.avatar_url || "")}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-full object-cover border border-white/10 bg-muted"
                          />
                          <div className="min-w-0">
                            {donor.lastName ? (
                              <>
                                <div className="truncate">{donor.firstName}</div>
                                <div className="truncate text-xs text-muted-foreground">{donor.lastName}</div>
                              </>
                            ) : (
                              <div className="truncate">{donor.firstName || donor.name}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{donor.donationCount}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">${donor.totalAmount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No donor data yet</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

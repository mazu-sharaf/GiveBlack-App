import { useEffect, useState } from "react";
import { fetchLedger } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { BookOpen, ChevronLeft, ChevronRight, DollarSign, Building2, Landmark, Leaf } from "lucide-react";
import { format } from "date-fns";

interface AccountSummary {
  platform: number;
  org: number;
  endowment: number;
  ecosystem: number;
}

export default function LedgerPage() {
  const [entries, setEntries] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [accountType, setAccountType] = useState("all");
  const [summary, setSummary] = useState<AccountSummary>({ platform: 0, org: 0, endowment: 0, ecosystem: 0 });
  const limit = 50;

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit };
      if (accountType !== "all") params.account_type = accountType;
      const res = await fetchLedger(params);
      setEntries(res.entries || []);
      setTotal(res.total || 0);
      if (res.summary) {
        setSummary(res.summary as AccountSummary);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load ledger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, accountType]);

  const totalPages = Math.ceil(total / limit);

  const summaryCards = [
    { title: "Platform Revenue", value: summary.platform, icon: DollarSign, color: "text-primary", bg: "bg-primary/10" },
    { title: "Organization Payouts", value: summary.org, icon: Building2, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Endowment Fund", value: summary.endowment, icon: Landmark, color: "text-purple-500", bg: "bg-purple-500/10" },
    { title: "Ecosystem / Reinvest", value: summary.ecosystem, icon: Leaf, color: "text-cyan-500", bg: "bg-cyan-500/10" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-6 w-6" /> Ledger</h2>
          <p className="text-sm text-muted-foreground mt-1">{total} entries</p>
        </div>
        <Select value={accountType} onValueChange={(v) => { setAccountType(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Account Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="platform">Platform</SelectItem>
            <SelectItem value="org">Organization</SelectItem>
            <SelectItem value="ecosystem">Ecosystem</SelectItem>
            <SelectItem value="endowment">Endowment</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{c.title}</CardTitle>
              <div className={`h-8 w-8 rounded-lg ${c.bg} flex items-center justify-center`}>
                <c.icon className={`h-4 w-4 ${c.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-xl font-bold ${c.value >= 0 ? "text-primary" : "text-red-400"}`}>
                ${Math.abs(c.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Account Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Released</TableHead>
                    <TableHead className="hidden md:table-cell">Donation ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => {
                    const amt = Number(e.amount || 0);
                    return (
                      <TableRow key={String(e.id)}>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {e.created_at ? format(new Date(e.created_at as string), "MMM d, yyyy HH:mm") : "--"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{String(e.account_type || "--")}</Badge>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${amt >= 0 ? "text-primary" : "text-red-400"}`}>
                          {amt >= 0 ? "+" : "-"}${Math.abs(amt).toFixed(2)}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline" className={e.released ? "bg-primary/20 text-primary border-primary/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"}>
                            {e.released ? "Released" : "Held"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-xs font-mono truncate max-w-[120px]">
                          {e.donation_id ? String(e.donation_id).slice(0, 12) + "..." : "--"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {entries.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No ledger entries</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

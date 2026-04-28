import { useEffect, useState } from "react";
import { dbQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, CreditCard, Download } from "lucide-react";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  completed: "bg-primary/20 text-primary border-primary/30",
  succeeded: "bg-primary/20 text-primary border-primary/30",
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
  refunded: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

export default function TransactionsPage() {
  interface Transaction { id: string; amount: string | number; status: string; created_at?: string; type?: string; transaction_type?: string; stripe_payment_intent_id?: string; org_id?: string }
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const opts: import("@/lib/api").QueryOptions = {
        order: { column: "created_at", ascending: false },
        limit: 200,
      };
      if (search) {
        opts.orRaw = `stripe_payment_intent_id.ilike.%${search}%`;
      }
      const res = await dbQuery("transactions", opts);
      setTransactions(res.data || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const totalAmount = transactions.reduce((s, t) => s + Number(t.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="h-6 w-6" /> Transactions</h2>
          <p className="text-sm text-muted-foreground mt-1">{transactions.length} transactions -- Total: ${totalAmount.toLocaleString()}</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by payment ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button type="submit" variant="secondary">Search</Button>
          </form>
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
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead className="hidden md:table-cell">Payment ID</TableHead>
                    <TableHead className="hidden lg:table-cell">Org</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {t.created_at ? format(new Date(t.created_at), "MMM d, yyyy HH:mm") : "--"}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-primary">${Number(t.amount || 0).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[t.status] || ""}>{t.status || "unknown"}</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">{t.type || t.transaction_type || "--"}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-xs font-mono truncate max-w-[150px]">
                        {t.stripe_payment_intent_id || "--"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground truncate max-w-[120px]">{t.org_id || "--"}</TableCell>
                    </TableRow>
                  ))}
                  {transactions.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No transactions found</TableCell></TableRow>
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

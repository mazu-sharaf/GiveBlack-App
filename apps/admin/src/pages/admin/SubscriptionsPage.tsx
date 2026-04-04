import { useEffect, useState } from "react";
import {
  adminAddSubscription,
  adminRemoveSubscription,
  fetchSubscriptions
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Zap, CreditCard, DollarSign, TrendingUp, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface Subscription {
  id: string;
  org_id: string;
  tier: string;
  status: string;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  created_at?: string;
  org?: { name?: string; contact_email?: string };
  org_name?: string;
  org_contact_email?: string;
  amount?: number;
}

const TIER_PRICES: Record<string, number> = {
  growth: 29,
  institutional: 99,
};

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  trialing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  past_due: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  canceled: "bg-red-500/20 text-red-400 border-red-500/30",
  incomplete: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const tierColors: Record<string, string> = {
  growth: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  institutional: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  free: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchSubscriptions();
      setSubscriptions(res.subscriptions || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const activeCount = subscriptions.filter((s) => s.status === "active").length;
  const trialingCount = subscriptions.filter((s) => s.status === "trialing").length;
  const pastDueCount = subscriptions.filter((s) => s.status === "past_due").length;

  const mrr = subscriptions
    .filter((s) => s.status === "active" || s.status === "trialing")
    .reduce((total, s) => total + (s.amount || TIER_PRICES[s.tier] || 0), 0);

  const arr = mrr * 12;

  const openStripePortal = (subId?: string) => {
    if (!subId) return;
    window.open(`https://dashboard.stripe.com/subscriptions/${subId}`, "_blank");
  };

  const openStripeCustomer = (custId?: string) => {
    if (!custId) return;
    window.open(`https://dashboard.stripe.com/customers/${custId}`, "_blank");
  };

  const summaryCards = [
    { title: "Monthly Recurring Revenue", value: `$${mrr.toLocaleString()}`, icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "Annual Run Rate", value: `$${arr.toLocaleString()}`, icon: TrendingUp, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Active Subscriptions", value: activeCount, icon: Zap, color: "text-purple-500", bg: "bg-purple-500/10" },
    { title: "Past Due", value: pastDueCount, icon: CreditCard, color: pastDueCount > 0 ? "text-amber-500" : "text-muted-foreground", bg: pastDueCount > 0 ? "bg-amber-500/10" : "bg-muted/50" },
  ];

  const runAction = async (subscriptionId: string, action: () => Promise<unknown>, successMessage: string) => {
    setPendingActionId(subscriptionId);
    try {
      await action();
      toast.success(successMessage);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPendingActionId(null);
    }
  };

  const addSubscription = async (s: Subscription, targetTier: "growth" | "institutional") => {
    if (pendingActionId === s.id) return;
    if (s.status === "active" && s.tier === targetTier) {
      toast.error("This subscription is already active.");
      return;
    }
    if (!window.confirm(`Add ${targetTier} subscription for ${s.org?.name || s.org_name || "this organization"} now?`)) return;
    await runAction(
      s.id,
      () => adminAddSubscription(s.id, targetTier),
      `Subscription added: ${targetTier}`
    );
  };

  const removeSubscription = async (s: Subscription) => {
    if (pendingActionId === s.id) return;
    if (s.status !== "active") {
      toast.error("This subscription is already removed.");
      return;
    }
    if (!window.confirm(`Remove subscription for ${s.org?.name || s.org_name || "this organization"} now?`)) return;
    await runAction(s.id, () => adminRemoveSubscription(s.id), "Subscription removed");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><Zap className="h-6 w-6" /> Subscriptions</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {subscriptions.length} total -- {activeCount} active{trialingCount > 0 ? `, ${trialingCount} trialing` : ""}
        </p>
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
              <div className="text-xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">MRR</TableHead>
                    <TableHead className="hidden md:table-cell">Period</TableHead>
                    <TableHead className="hidden lg:table-cell">Stripe</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{s.org?.name || s.org_name || s.org_id}</p>
                          <p className="text-xs text-muted-foreground">{s.org?.contact_email || s.org_contact_email || ""}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={tierColors[s.tier] || ""}>{s.tier}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[s.status] || ""}>{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell font-medium text-emerald-500">
                        ${s.amount || TIER_PRICES[s.tier] || 0}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {s.current_period_start ? format(new Date(s.current_period_start), "MMM d") : "--"}
                        {" - "}
                        {s.current_period_end ? format(new Date(s.current_period_end), "MMM d, yyyy") : "--"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-1">
                          {s.stripe_subscription_id && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openStripePortal(s.stripe_subscription_id)}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {s.stripe_customer_id && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="View customer in Stripe" onClick={() => openStripeCustomer(s.stripe_customer_id)}>
                              <CreditCard className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {!s.stripe_subscription_id && !s.stripe_customer_id && (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {s.created_at ? format(new Date(s.created_at), "MMM d, yyyy") : "--"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {s.status === "active" && s.tier !== "free" ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={pendingActionId === s.id}
                              onClick={() => removeSubscription(s)}
                            >
                              Remove
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={pendingActionId === s.id}
                                onClick={() => addSubscription(s, "growth")}
                              >
                                Add Growth
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={pendingActionId === s.id}
                                onClick={() => addSubscription(s, "institutional")}
                              >
                                Add Institutional
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {subscriptions.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No subscriptions found</TableCell></TableRow>
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

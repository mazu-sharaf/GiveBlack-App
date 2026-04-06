import { useCallback, useEffect, useState } from "react";
import {
  fetchDonorRecipients,
  fetchDonorRecipientIds,
  sendNotificationsToUserIds,
  type DonorRecipientRow,
} from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Bell, Send, AlertTriangle, Search, ChevronLeft, ChevronRight, Users } from "lucide-react";

const PAGE_SIZE = 10;

export default function BroadcastNotificationsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [donors, setDonors] = useState<DonorRecipientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingDonors, setLoadingDonors] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingDonors(true);
      try {
        const res = await fetchDonorRecipients({ q: search, page, limit: PAGE_SIZE });
        if (!cancelled) {
          setDonors(res.donors);
          setTotal(res.total);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load donors");
          setDonors([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoadingDonors(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [search, page]);

  const pageIds = donors.map((d) => d.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));

  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const togglePage = useCallback(() => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach((id) => n.delete(id));
      } else {
        pageIds.forEach((id) => n.add(id));
      }
      return n;
    });
  }, [allPageSelected, pageIds]);

  const handleSelectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const res = await fetchDonorRecipientIds(search);
      setSelected((prev) => {
        const n = new Set(prev);
        res.ids.forEach((id) => n.add(id));
        return n;
      });
      toast.success(`Added ${res.ids.length} donor(s) to selection (matching current search).`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not load all matching donors");
    } finally {
      setSelectingAll(false);
    }
  };

  const selectedCount = selected.size;

  const canSubmit = selectedCount > 0 && pushTitle.trim().length > 0 && pushBody.trim().length > 0;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const runSend = async () => {
    if (!canSubmit) return;
    const userIds = Array.from(selected);
    setSending(true);
    setConfirmOpen(false);
    try {
      const res = await sendNotificationsToUserIds({
        userIds,
        pushTitle: pushTitle.trim(),
        pushBody: pushBody.trim(),
      });
      toast.success(
        `Sent to ${res.users} donor(s). Push delivered to ${res.pushTokens} device(s).`
      );
      setPushTitle("");
      setPushBody("");
      setSelected(new Set());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="h-7 w-7 text-emerald-500" />
          Notify donors
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Choose accounts from the list (everyone except admin, manager, and staff—same pool as Users minus
          operators), then compose a push. Only selected recipients receive it (push + in-app).
        </p>
      </div>

      <Alert variant="destructive" className="border-amber-600/50 bg-amber-950/20 text-amber-100 [&>svg]:text-amber-400">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Use carefully</AlertTitle>
        <AlertDescription>
          Sends real push and in-app notifications to the donors you select. Double-check copy before sending. There is no
          undo.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-500" />
            Select recipients
          </CardTitle>
          <CardDescription>
            Active accounts that are <strong className="text-foreground">not</strong> admin, super_admin, manager, or
            staff (includes donors, charity accounts, etc.). Search by name or email; use the role column to tell them
            apart.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name or email…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                <strong className="text-foreground">{selectedCount}</strong> selected
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={selectingAll || total === 0}
                onClick={() => void handleSelectAllMatching()}
              >
                {selectingAll ? "Loading…" : "Select all matching"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={selectedCount === 0}
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </Button>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        allPageSelected ? true : somePageSelected && !allPageSelected ? "indeterminate" : false
                      }
                      onCheckedChange={() => togglePage()}
                      aria-label="Select all on this page"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-[120px]">Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingDonors ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-4 w-4" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-48" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-64" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : donors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {total === 0
                        ? "No eligible accounts yet—only admin, manager, and staff exist, everyone is disabled, or the API failed to load (check Network for /donor-recipients)."
                        : "No rows on this page."}
                    </TableCell>
                  </TableRow>
                ) : (
                  donors.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(d.id)}
                          onCheckedChange={() => toggleRow(d.id)}
                          aria-label={`Select ${d.full_name || d.email}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{d.full_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{d.email}</TableCell>
                      <TableCell className="text-muted-foreground text-sm capitalize">{d.role || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {total > 0 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loadingDonors}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span>
                  Page {page} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loadingDonors}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compose push</CardTitle>
          <CardDescription>
            Text should be short—users see it on the lock screen and in the in-app notification list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="pushTitle">Push title</Label>
            <Input
              id="pushTitle"
              placeholder="e.g. New feature in GiveBlack"
              value={pushTitle}
              onChange={(e) => setPushTitle(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pushBody">Push body</Label>
            <Textarea
              id="pushBody"
              placeholder="Short message shown in the notification..."
              value={pushBody}
              onChange={(e) => setPushBody(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">{pushBody.length}/500</p>
          </div>

          <Button
            type="button"
            className="gap-2"
            disabled={!canSubmit || sending}
            onClick={() => setConfirmOpen(true)}
          >
            <Send className="h-4 w-4" />
            {sending ? "Sending…" : "Review & send"}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to {selectedCount} donor{selectedCount === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>
                This will send push and in-app notifications to the selected donor accounts only. Confirm the content is
                correct.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={sending}
              onClick={(e) => {
                e.preventDefault();
                void runSend();
              }}
            >
              {sending ? "Sending…" : "Send notifications"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

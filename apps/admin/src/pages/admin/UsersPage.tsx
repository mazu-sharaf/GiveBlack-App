import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dbQuery, dbMutate, deleteAdminUser, resolveImageUrl, uploadFile } from "@/lib/api";
import type { QueryOptions } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, UserCheck, UserX, Users, Shield, Eye, DollarSign, ChevronLeft, ChevronRight, RefreshCw, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { getCurrentRole } from "@/lib/admin-auth";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-primary/20 text-primary border-primary/30",
  super_admin: "bg-red-500/20 text-red-400 border-red-500/30",
  manager: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  staff: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  donor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  charity: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  user: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  avatar_url?: string | null;
  created_at: string;
  disabled_at: string | null;
}

interface Donation {
  id: string;
  amount: number;
  org_name?: string;
  created_at: string;
  status: string;
}

const PAGE_SIZE = 50;

export default function UsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [detailUser, setDetailUser] = useState<User | null>(null);
  const [userDonations, setUserDonations] = useState<Donation[]>([]);
  const [loadingDonations, setLoadingDonations] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [avatarDraft, setAvatarDraft] = useState("");
  const [savingAvatar, setSavingAvatar] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState("");

  const currentAdminRole = getCurrentRole();
  const canEditRoles = currentAdminRole === "admin" || currentAdminRole === "super_admin";
  const canDeleteUsers = currentAdminRole === "admin" || currentAdminRole === "super_admin";

  const load = async () => {
    setLoading(true);
    try {
      const opts: QueryOptions = {
        select: "id, email, full_name, role, avatar_url, created_at, disabled_at",
        order: { column: "created_at", ascending: false },
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      };
      if (search) {
        opts.orRaw = `email.ilike.%${search}%,full_name.ilike.%${search}%`;
      }
      if (roleFilter !== "all") {
        opts.filters = [{ column: "role", op: "eq", value: roleFilter }];
      }
      const res = await dbQuery<User>("users", opts);
      setUsers(res.data || []);
      const countOpts: QueryOptions = { select: "id", limit: 10000 };
      if (search) countOpts.orRaw = opts.orRaw;
      if (roleFilter !== "all") countOpts.filters = opts.filters;
      const countRes = await dbQuery("users", countOpts);
      setTotalCount((countRes.data || []).length);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [roleFilter, page]);

  useEffect(() => {
    const interval = setInterval(() => { load(); }, 15000);
    return () => clearInterval(interval);
  }, [roleFilter, page, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const pageIds = users.map((u) => u.id);
  const selectedCount = selected.size;
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));
  const toggleRowSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePageSelect = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });

  const bulkDeleteSelected = async () => {
    if (!canDeleteUsers || selected.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    try {
      const results = await Promise.allSettled(ids.map((id) => deleteAdminUser(id)));
      const okIds: string[] = [];
      const failed: Array<{ id: string; reason: string }> = [];
      results.forEach((r, idx) => {
        const id = ids[idx]!;
        if (r.status === "fulfilled") okIds.push(id);
        else failed.push({ id, reason: r.reason instanceof Error ? r.reason.message : "Delete failed" });
      });

      if (okIds.length) setUsers((prev) => prev.filter((u) => !okIds.includes(u.id)));
      setSelected(new Set(failed.map((f) => f.id)));

      if (failed.length === 0) toast.success(`Deleted ${okIds.length} user${okIds.length === 1 ? "" : "s"}`);
      else toast.error(`Deleted ${okIds.length}. Failed ${failed.length}. First: ${failed[0]?.reason || "Unknown"}`);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!canEditRoles) {
      toast.error("Only admins can change user roles");
      return;
    }
    try {
      await dbMutate("users", "update", { role: newRole }, [{ column: "id", op: "eq", value: userId }]);
      toast.success("Role updated");
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const toggleDisabled = async (user: User) => {
    const isDisabled = !!user.disabled_at;
    try {
      await dbMutate("users", "update",
        { disabled_at: isDisabled ? null : new Date().toISOString() },
        [{ column: "id", op: "eq", value: user.id }]
      );
      toast.success(isDisabled ? "User enabled" : "User disabled");
      setUsers((prev) => prev.map((u) =>
        u.id === user.id ? { ...u, disabled_at: isDisabled ? null : new Date().toISOString() } : u
      ));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update user");
    }
  };

  const openDetail = async (user: User) => {
    setDetailUser(user);
    setAvatarDraft(user.avatar_url || "");
    setLoadingDonations(true);
    try {
      const res = await dbQuery<Donation>("donations", {
        filters: [{ column: "user_email", op: "eq", value: user.email }],
        order: { column: "created_at", ascending: false },
        limit: 20,
      });
      setUserDonations(res.data || []);
    } catch {
      setUserDonations([]);
    } finally {
      setLoadingDonations(false);
    }
  };

  const pickAvatar = () => avatarFileRef.current?.click();

  const handleAvatarFile = async (file: File | null) => {
    if (!file) return;
    try {
      setSavingAvatar(true);
      const url = await uploadFile(file);
      if (!url) throw new Error("Upload did not return a URL");
      setAvatarDraft(url);
      toast.success("Photo uploaded. Click Save to apply.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSavingAvatar(false);
      if (avatarFileRef.current) avatarFileRef.current.value = "";
    }
  };

  const saveAvatar = async () => {
    if (!detailUser) return;
    const trimmed = avatarDraft.trim();
    try {
      setSavingAvatar(true);
      await dbMutate(
        "users",
        "update",
        { avatar_url: trimmed || null, avatar_source: trimmed ? "manual" : null },
        [{ column: "id", op: "eq", value: detailUser.id }]
      );
      toast.success("Profile photo updated");
      const next = { ...detailUser, avatar_url: trimmed || null };
      setDetailUser(next);
      setUsers((prev) => prev.map((u) => (u.id === next.id ? { ...u, avatar_url: next.avatar_url } : u)));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile photo");
    } finally {
      setSavingAvatar(false);
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      await deleteAdminUser(userId);
      toast.success("User deleted");
      setDetailUser(null);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" /> Users</h2>
        <p className="text-sm text-muted-foreground mt-1">{totalCount} total users</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Button type="submit" variant="secondary">Search</Button>
              <Button type="button" variant="outline" size="icon" onClick={() => load()} title="Refresh">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </form>
            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="donor">Donor</SelectItem>
                <SelectItem value="charity">Charity</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allPageSelected ? true : somePageSelected && !allPageSelected ? "indeterminate" : false}
                        onCheckedChange={() => togglePageSelect()}
                        aria-label="Select all on this page"
                      />
                    </TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(user.id)}
                          onCheckedChange={() => toggleRowSelect(user.id)}
                          aria-label={`Select ${user.full_name || user.email}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{user.full_name || "--"}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {canEditRoles ? (
                          <Select value={user.role} onValueChange={(v) => handleRoleChange(user.id, v)}>
                            <SelectTrigger className="w-[110px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="donor">Donor</SelectItem>
                              <SelectItem value="charity">Charity</SelectItem>
                              <SelectItem value="staff">Staff</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className={ROLE_COLORS[user.role] || ""}>{user.role}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {user.created_at ? format(new Date(user.created_at), "MMM d, yyyy") : "--"}
                      </TableCell>
                      <TableCell>
                        {user.disabled_at ? (
                          <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">Disabled</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(user)} title="View details">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleDisabled(user)}
                            title={user.disabled_at ? "Enable user" : "Disable user"}
                          >
                            {user.disabled_at ? <UserCheck className="h-4 w-4 text-primary" /> : <UserX className="h-4 w-4 text-red-400" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {canDeleteUsers && selectedCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
          <span className="text-sm text-muted-foreground">
            <strong className="text-foreground">{selectedCount}</strong> selected
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={bulkDeleting}>
              Clear selection
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" size="sm" disabled={bulkDeleting}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete selected
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete selected users?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cannot be undone. Type <strong>DELETE</strong> to confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="pt-2">
                  <Input
                    value={bulkDeleteConfirm}
                    onChange={(e) => setBulkDeleteConfirm(e.target.value)}
                    placeholder='Type "DELETE"'
                    autoComplete="off"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground"
                    disabled={bulkDeleteConfirm.trim().toUpperCase() !== "DELETE"}
                    onClick={() => {
                      setBulkDeleteConfirm("");
                      void bulkDeleteSelected();
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

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

      <Dialog open={!!detailUser} onOpenChange={() => setDetailUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" /> User Details
            </DialogTitle>
          </DialogHeader>
          {detailUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{detailUser.full_name || "--"}</span></div>
                <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{detailUser.email}</span></div>
                <div><span className="text-muted-foreground">Role:</span> <Badge variant="outline" className={ROLE_COLORS[detailUser.role] || ""}>{detailUser.role}</Badge></div>
                <div><span className="text-muted-foreground">Status:</span> {detailUser.disabled_at ? "Disabled" : "Active"}</div>
                <div><span className="text-muted-foreground">Joined:</span> {detailUser.created_at ? format(new Date(detailUser.created_at), "MMM d, yyyy") : "--"}</div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-sm">Profile photo (DP)</h4>
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-full overflow-hidden bg-muted flex items-center justify-center border border-border">
                    {avatarDraft.trim() ? (
                      <img
                        src={resolveImageUrl(avatarDraft.trim())}
                        alt="User avatar"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">No photo</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Paste image URL (or upload)"
                      value={avatarDraft}
                      onChange={(e) => setAvatarDraft(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <input
                        ref={avatarFileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void handleAvatarFile(e.target.files?.[0] ?? null)}
                      />
                      <Button type="button" variant="secondary" size="sm" onClick={pickAvatar} disabled={savingAvatar}>
                        Upload
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setAvatarDraft("")} disabled={savingAvatar}>
                        Remove
                      </Button>
                      <Button type="button" size="sm" onClick={() => void saveAvatar()} disabled={savingAvatar}>
                        {savingAvatar ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-sm mb-2 flex items-center gap-1"><DollarSign className="h-4 w-4" /> Recent Donations</h4>
                {loadingDonations ? (
                  <Skeleton className="h-20 w-full" />
                ) : userDonations.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {userDonations.map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                        <div>
                          <span className="font-medium text-primary">${Number(d.amount).toLocaleString()}</span>
                          <span className="text-muted-foreground ml-2">{d.org_name || "--"}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{d.created_at ? format(new Date(d.created_at), "MMM d, yyyy") : ""}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No donations found</p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => navigate(`/donors/${encodeURIComponent(detailUser.email)}`)}>
                  View Full Profile
                </Button>
                {canDeleteUsers && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4 mr-1" /> Delete user
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete user permanently?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This cannot be undone. Donation history will remain, but the user account will be removed.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground"
                          onClick={() => void deleteUser(detailUser.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

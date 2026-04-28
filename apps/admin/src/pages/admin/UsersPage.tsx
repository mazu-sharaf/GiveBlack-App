import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dbQuery, dbMutate } from "@/lib/api";
import type { QueryOptions } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, UserCheck, UserX, Users, Shield, Eye, DollarSign, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
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

  const currentAdminRole = getCurrentRole();
  const canEditRoles = currentAdminRole === "admin" || currentAdminRole === "super_admin";

  const load = async () => {
    setLoading(true);
    try {
      const opts: QueryOptions = {
        select: "id, email, full_name, role, created_at, disabled_at",
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
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden sm:table-cell">Joined</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
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
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm whitespace-nowrap">
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
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
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
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

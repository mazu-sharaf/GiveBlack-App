import { useEffect, useState } from "react";
import { dbQuery, createStaff, updateStaff, deleteStaff } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Shield, Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-primary/20 text-primary border-primary/30",
  super_admin: "bg-red-500/20 text-red-400 border-red-500/30",
  manager: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  staff: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export default function StaffPage() {
  interface StaffMember { id: string; email: string; full_name: string; role: string; created_at: string; admin_permissions?: any }
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<StaffMember | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "staff",
    permissions: {
      canManageUsers: false,
      canChangeRoles: false,
      canAccessSettings: false,
      canManagePayments: false,
    },
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await dbQuery("users", {
        select: "id, email, full_name, role, created_at, admin_permissions",
        filters: [],
        order: { column: "created_at", ascending: false },
        limit: 200,
      });
      const allUsers = (res.data || []) as StaffMember[];
      setStaffList(allUsers.filter((u) => ["admin", "super_admin", "manager", "staff"].includes(u.role)));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditItem(null);
    setForm({
      name: "",
      email: "",
      role: "staff",
      permissions: { canManageUsers: false, canChangeRoles: false, canAccessSettings: false, canManagePayments: false },
    });
    setDialogOpen(true);
  };

  const openEdit = (item: Record<string, unknown>) => {
    setEditItem(item);
    const perms = (item as any).admin_permissions || {};
    setForm({
      name: String(item.full_name || ""),
      email: String(item.email || ""),
      role: String(item.role || "staff"),
      permissions: {
        canManageUsers: Boolean(perms.canManageUsers),
        canChangeRoles: Boolean(perms.canChangeRoles),
        canAccessSettings: Boolean(perms.canAccessSettings),
        canManagePayments: Boolean(perms.canManagePayments),
      },
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editItem) {
        await updateStaff(String(editItem.email), {
          name: form.name,
          role: form.role,
          permissions: form.permissions,
        });
        toast.success("Staff updated");
      } else {
        if (!form.email || !form.name) {
          toast.error("Name and email are required");
          return;
        }
        await createStaff({ email: form.email, name: form.name, role: form.role, permissions: form.permissions });
        toast.success("Staff created");
      }
      setDialogOpen(false);
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Operation failed");
    }
  };

  const handleDelete = async (email: string) => {
    try {
      await deleteStaff(email);
      toast.success("Staff removed");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Operation failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6" /> Staff Management</h2>
          <p className="text-sm text-muted-foreground mt-1">{staffList.length} staff members</p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-1" /> Add Staff
        </Button>
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
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden sm:table-cell">Joined</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffList.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.full_name || "--"}</TableCell>
                      <TableCell className="text-muted-foreground">{s.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ROLE_COLORS[s.role] || ""}>{s.role}</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                        {s.created_at ? format(new Date(s.created_at), "MMM d, yyyy") : "--"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove staff member?</AlertDialogTitle>
                                <AlertDialogDescription>This will delete {s.email} from the system.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(s.email)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {staffList.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No staff members</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Staff" : "Add Staff Member"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} disabled={!!editItem} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Permissions (overrides)</Label>
              <div className="grid grid-cols-1 gap-2 text-sm">
                {(
                  [
                    ["canManageUsers", "Manage users / staff allowlist"],
                    ["canChangeRoles", "Change roles"],
                    ["canAccessSettings", "Access platform settings"],
                    ["canManagePayments", "Manage payments/subscriptions"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean((form.permissions as any)[k])}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, permissions: { ...f.permissions, [k]: e.target.checked } }))
                      }
                    />
                    <span className="text-muted-foreground">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90">
                  Save
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apply changes?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will {editItem ? "update this staff member" : "create a new staff member"} and change their access.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>No</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSave}>Yes</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

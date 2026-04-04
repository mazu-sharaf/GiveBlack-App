import { useEffect, useState } from "react";
import { dbQuery, dbMutate } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { GraduationCap, Plus, Pencil } from "lucide-react";

function normalizePartnerCode(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface PartnerRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
  created_at?: string;
}

export default function EducationPartnersPage() {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<PartnerRow | null>(null);
  const [form, setForm] = useState({ code: "", name: "", active: true });

  const load = async () => {
    setLoading(true);
    try {
      const res = await dbQuery<PartnerRow>("education_partners", {
        order: { column: "created_at", ascending: false },
        limit: 500,
      });
      setPartners((res.data || []) as PartnerRow[]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load partners");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditItem(null);
    setForm({ code: "", name: "", active: true });
    setDialogOpen(true);
  };

  const openEdit = (p: PartnerRow) => {
    setEditItem(p);
    setForm({ code: p.code, name: p.name, active: p.active });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const code = normalizePartnerCode(form.code);
    if (!code) {
      toast.error("Code is required (letters and numbers only).");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    try {
      if (editItem) {
        await dbMutate("education_partners", "update", { name: form.name.trim(), active: form.active }, [
          { column: "id", op: "eq", value: editItem.id },
        ]);
        toast.success("Partner updated");
      } else {
        await dbMutate("education_partners", "insert", {
          code,
          name: form.name.trim(),
          active: form.active,
        });
        toast.success("Partner created");
      }
      setDialogOpen(false);
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6" /> Education partners
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Codes for deep links and attribution of the reinvest-in-education slice on donations.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1" /> New partner
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {partners.length === 0 ? (
              <p className="p-8 text-center text-muted-foreground text-sm">No partners yet. Create one to enable attribution links.</p>
            ) : (
              partners.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">?partner={p.code}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        p.active ? "border-emerald-500/40 text-emerald-400" : "border-border text-muted-foreground"
                      }`}
                    >
                      {p.active ? "Active" : "Inactive"}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit partner" : "New partner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ep-code">Code</Label>
              <Input
                id="ep-code"
                placeholder="e.g. stateu"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                disabled={!!editItem}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Lowercase letters and numbers only. Used in donate links as ?partner=</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ep-name">Display name</Label>
              <Input
                id="ep-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Partner or program name"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="ep-active">Active</Label>
              <Switch id="ep-active" checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

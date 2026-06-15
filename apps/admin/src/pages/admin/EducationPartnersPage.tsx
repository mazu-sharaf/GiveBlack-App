import { useEffect, useState } from "react";
import { dbQuery, dbMutate } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  organization_id?: string | null;
  receives_education_fund?: boolean;
  receives_endowment_fund?: boolean;
  created_at?: string;
}

interface OrgOption {
  id: string;
  name: string;
}

export default function EducationPartnersPage() {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<PartnerRow | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    active: true,
    organization_id: "" as string,
    receives_education_fund: true,
    receives_endowment_fund: true,
  });

  const load = async () => {
    setLoading(true);
    try {
      const [partnerRes, orgRes] = await Promise.all([
        dbQuery<PartnerRow>("education_partners", {
          order: { column: "created_at", ascending: false },
          limit: 500,
        }),
        dbQuery<OrgOption>("organizations", {
          select: "id, name",
          order: { column: "name", ascending: true },
          limit: 500,
        }),
      ]);
      setPartners((partnerRes.data || []) as PartnerRow[]);
      setOrgs((orgRes.data || []) as OrgOption[]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load partners");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const orgName = (id?: string | null) => orgs.find((o) => o.id === id)?.name;

  const openCreate = () => {
    setEditItem(null);
    setForm({
      code: "",
      name: "",
      active: true,
      organization_id: "",
      receives_education_fund: true,
      receives_endowment_fund: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (p: PartnerRow) => {
    setEditItem(p);
    setForm({
      code: p.code,
      name: p.name,
      active: p.active,
      organization_id: p.organization_id || "",
      receives_education_fund: p.receives_education_fund !== false,
      receives_endowment_fund: p.receives_endowment_fund !== false,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const code = normalizePartnerCode(form.code);
    if (!code && !editItem) {
      toast.error("Code is required (letters and numbers only).");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    const payload = {
      name: form.name.trim(),
      active: form.active,
      organization_id: form.organization_id || null,
      receives_education_fund: form.receives_education_fund,
      receives_endowment_fund: form.receives_endowment_fund,
    };
    try {
      if (editItem) {
        await dbMutate("education_partners", "update", payload, [
          { column: "id", op: "eq", value: editItem.id },
        ]);
        toast.success("Code updated");
      } else {
        await dbMutate("education_partners", "insert", {
          code,
          ...payload,
        });
        toast.success("Organizational code created");
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
            <GraduationCap className="h-6 w-6" /> Organizational codes
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Assign codes to approved organizations. Education and endowment slices route to their Connect account when linked.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-1" /> New code
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
              <p className="p-8 text-center text-muted-foreground text-sm">
                No codes yet. Create one to enable checkout attribution and fund payouts.
              </p>
            ) : (
              partners.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 p-4 hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">?code={p.code}</p>
                    {p.organization_id ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        Org: {orgName(p.organization_id) || p.organization_id}
                        {" · "}
                        {p.receives_education_fund !== false ? "Education" : ""}
                        {p.receives_education_fund !== false && p.receives_endowment_fund !== false ? " + " : ""}
                        {p.receives_endowment_fund !== false ? "Endowment" : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600 mt-1">Legacy attribution only (no org linked)</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        p.active ? "border-primary/40 text-primary" : "border-border text-muted-foreground"
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
            <DialogTitle>{editItem ? "Edit organizational code" : "New organizational code"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ep-code">Code</Label>
              <Input
                id="ep-code"
                placeholder="e.g. harlem2026"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                disabled={!!editItem}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Used at checkout and in links as ?code=</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ep-name">Display name</Label>
              <Input
                id="ep-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Organization or program name"
              />
            </div>
            <div className="space-y-2">
              <Label>Linked organization</Label>
              <Select
                value={form.organization_id || "__none__"}
                onValueChange={(v) => setForm((f) => ({ ...f, organization_id: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select organization (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (legacy attribution)</SelectItem>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                When set, education and endowment slices can transfer to this org via Stripe Connect.
              </p>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="ep-edu">Receives education fund</Label>
              <Switch
                id="ep-edu"
                checked={form.receives_education_fund}
                onCheckedChange={(v) => setForm((f) => ({ ...f, receives_education_fund: v }))}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="ep-end">Receives endowment fund</Label>
              <Switch
                id="ep-end"
                checked={form.receives_endowment_fund}
                onCheckedChange={(v) => setForm((f) => ({ ...f, receives_endowment_fund: v }))}
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
            <Button onClick={handleSave} className="bg-primary hover:bg-primary/90">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

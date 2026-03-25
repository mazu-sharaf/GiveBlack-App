import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { dbQuery, dbQuerySingle, dbMutate, fetchCategories, resolveImageUrl, uploadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, ImagePlus, Save, Trash2, Upload, X } from "lucide-react";

interface Category { id: string; name: string; }

export default function OrganizationDetailPage() {
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    id: "", name: "", description: "", category_id: "", goal: 0, raised: 0,
    image_color: "#333333", initials: "", featured: false, verified: false, image_url: "",
    cover_image_url: "",
    bank_name: "", account_holder_name: "", account_last4: "", routing_number: "",
    stripe_account_id: "",
    absorb_fees: false, ecosystem_opt_in: true, endowment_opt_in: true,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const [dragOver, setDragOver] = useState<"logo" | "cover" | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const set = (key: string, val: unknown) => setForm((p) => ({ ...p, [key]: val }));

  const logoPreviewUrl = useMemo(() => (form.image_url ? resolveImageUrl(form.image_url) : ""), [form.image_url]);
  const coverPreviewUrl = useMemo(() => (form.cover_image_url ? resolveImageUrl(form.cover_image_url) : ""), [form.cover_image_url]);

  useEffect(() => {
    const load = async () => {
      try {
        const catRes = await fetchCategories();
        setCategories(catRes.categories || []);
      } catch {
        try {
          const catRes = await dbQuery("categories", { select: "id, name" });
          setCategories(catRes.data || []);
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : "Failed to load categories");
        }
      }
      if (!isNew && id) {
        try {
          const res = await dbQuerySingle("organizations", {
            filters: [{ column: "id", op: "eq", value: id }],
          });
          const d = res.data as Record<string, unknown> | null;
          if (d) {
            setForm({
              id: String(d.id || ""), name: String(d.name || ""), description: String(d.description || ""),
              category_id: String(d.category_id || ""), goal: Number(d.goal || 0), raised: Number(d.raised || 0),
              image_color: String(d.image_color || "#333333"), initials: String(d.initials || ""),
              featured: Boolean(d.featured), verified: Boolean(d.verified), image_url: String(d.image_url || ""),
              cover_image_url: String(d.cover_image_url || ""),
              bank_name: String(d.bank_name || ""), account_holder_name: String(d.account_holder_name || ""),
              account_last4: String(d.account_last4 || ""), routing_number: String(d.routing_number || ""),
              stripe_account_id: String(d.stripe_account_id || ""),
              absorb_fees: d.absorb_fees === undefined ? false : Boolean(d.absorb_fees),
              ecosystem_opt_in: d.ecosystem_opt_in === undefined ? true : Boolean(d.ecosystem_opt_in),
              endowment_opt_in: d.endowment_opt_in === undefined ? true : Boolean(d.endowment_opt_in),
            });
          }
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : "Failed to load organization");
        }
      }
    };
    load();
  }, [id, isNew]);

  const validateImageFile = (file: File): string | null => {
    if (!file.type.startsWith("image/")) return "Please choose an image file (PNG/JPG/WebP/etc).";
    const maxBytes = 10 * 1024 * 1024; // 10MB
    if (file.size > maxBytes) return "Image is too large (max 10MB).";
    return null;
  };

  const handlePickedFile = async (kind: "logo" | "cover", file: File) => {
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setUploading(kind);
    try {
      const url = await uploadFile(file);
      if (!url) throw new Error("Upload failed");
      if (kind === "logo") set("image_url", url);
      else set("cover_image_url", url);
      toast.success("Uploaded");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const handleDrop = async (kind: "logo" | "cover", e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await handlePickedFile(kind, file);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name, description: form.description,
        category_id: form.category_id || null, goal: form.goal,
        raised: form.raised,
        image_color: form.image_color,
        initials: form.initials || form.name.slice(0, 2).toUpperCase(),
        featured: form.featured, verified: form.verified, image_url: form.image_url || null,
        cover_image_url: form.cover_image_url || null,
        bank_name: form.bank_name || null,
        account_holder_name: form.account_holder_name || null,
        account_last4: form.account_last4 || null,
        routing_number: form.routing_number || null,
        stripe_account_id: form.stripe_account_id || null,
        absorb_fees: form.absorb_fees,
        ecosystem_opt_in: form.ecosystem_opt_in,
        endowment_opt_in: form.endowment_opt_in,
      };
      if (isNew) {
        payload.id = form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        await dbMutate("organizations", "insert", payload);
      } else {
        await dbMutate("organizations", "update", payload, [{ column: "id", op: "eq", value: form.id }]);
      }
      toast.success(isNew ? "Organization created" : "Organization updated");
      navigate("/organizations");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await dbMutate("organizations", "delete", {}, [{ column: "id", op: "eq", value: form.id }]);
      toast.success("Organization deleted");
      navigate("/organizations");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate("/organizations")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{isNew ? "New Organization" : "Edit Organization"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Organization Image</Label>
            <div className="flex items-center gap-4">
              <div
                className={[
                  "h-20 w-20 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden bg-muted relative",
                  dragOver === "logo" ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-border",
                ].join(" ")}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOver("logo");
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => void handleDrop("logo", e)}
              >
                {form.image_url ? (
                  <img src={logoPreviewUrl} alt="Org" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-lg font-bold text-white" style={{ backgroundColor: form.image_color }}>
                    {form.initials || "?"}
                  </div>
                )}
                <button
                  type="button"
                  className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity"
                  onClick={() => logoInputRef.current?.click()}
                  aria-label="Upload organization image"
                >
                  <div className="flex items-center gap-1 text-white text-xs font-medium">
                    <Upload className="h-4 w-4" /> Upload
                  </div>
                </button>
                {uploading === "logo" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs font-medium">
                    Uploading...
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex gap-2">
                  <Input placeholder="Paste image URL" value={form.image_url} onChange={(e) => set("image_url", e.target.value)} className="text-sm" />
                  <Button type="button" variant="secondary" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploading !== null}>
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handlePickedFile("logo", file);
                    e.currentTarget.value = "";
                  }}
                />
                {form.image_url && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set("image_url", "")}>
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">Drag & drop an image on the preview, or click Upload.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cover / Banner Image</Label>
            <div
              className={[
                "w-full h-32 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden bg-muted relative",
                dragOver === "cover" ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-border",
              ].join(" ")}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver("cover");
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => void handleDrop("cover", e)}
            >
              {form.cover_image_url ? (
                <img src={coverPreviewUrl} alt="Cover" className="h-full w-full object-cover" />
              ) : (
                <div className="text-muted-foreground text-sm flex flex-col items-center gap-1">
                  <ImagePlus className="h-6 w-6" />
                  <span>No cover image</span>
                </div>
              )}
              <button
                type="button"
                className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity"
                onClick={() => coverInputRef.current?.click()}
                aria-label="Upload cover image"
              >
                <div className="flex items-center gap-1 text-white text-xs font-medium">
                  <Upload className="h-4 w-4" /> Upload
                </div>
              </button>
              {uploading === "cover" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs font-medium">
                  Uploading...
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Input placeholder="Paste cover image URL" value={form.cover_image_url} onChange={(e) => set("cover_image_url", e.target.value)} className="text-sm" />
              <Button type="button" variant="secondary" size="sm" onClick={() => coverInputRef.current?.click()} disabled={uploading !== null}>
                <Upload className="h-4 w-4" />
              </Button>
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePickedFile("cover", file);
                e.currentTarget.value = "";
              }}
            />
            {form.cover_image_url && (
              <Button type="button" variant="ghost" size="sm" onClick={() => set("cover_image_url", "")}>
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
            <p className="text-xs text-muted-foreground">Drag & drop an image on the banner, or click Upload.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Initials</Label>
              <Input value={form.initials} onChange={(e) => set("initials", e.target.value)} maxLength={3} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category_id} onValueChange={(v) => set("category_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Goal ($)</Label>
              <Input type="number" value={form.goal} onChange={(e) => set("goal", Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Raised ($)</Label>
              <Input type="number" value={form.raised} onChange={(e) => set("raised", Number(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div className="space-y-2">
              <Label>Avatar Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.image_color} onChange={(e) => set("image_color", e.target.value)} className="h-10 w-10 rounded cursor-pointer border-0" />
                <Input value={form.image_color} onChange={(e) => set("image_color", e.target.value)} className="flex-1" />
              </div>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="flex items-center gap-2">
                <Switch checked={form.featured} onCheckedChange={(v) => set("featured", v)} />
                <Label>Featured</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.verified} onCheckedChange={(v) => set("verified", v)} />
                <Label>Verified</Label>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Bank Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="e.g. Chase Bank" />
              </div>
              <div className="space-y-2">
                <Label>Account Holder</Label>
                <Input value={form.account_holder_name} onChange={(e) => set("account_holder_name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Routing Number</Label>
                <Input value={form.routing_number} onChange={(e) => set("routing_number", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Account Last 4</Label>
                <Input value={form.account_last4} onChange={(e) => set("account_last4", e.target.value)} maxLength={4} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Stripe Account ID</Label>
              <Input value={form.stripe_account_id} onChange={(e) => set("stripe_account_id", e.target.value)} placeholder="acct_..." />
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Fee & Ecosystem Settings</h3>
            <div className="space-y-3">
              {[
                { key: "absorb_fees", label: "Absorb Fees", desc: "Organization covers processing fees" },
                { key: "ecosystem_opt_in", label: "Ecosystem Opt-In", desc: "Participate in the GiveBlack ecosystem" },
                { key: "endowment_opt_in", label: "Endowment Opt-In", desc: "Contribute to the community endowment" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch checked={Boolean((form as Record<string, unknown>)[item.key])} onCheckedChange={(v) => set(item.key, v)} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div>
              {!isNew && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Organization?</AlertDialogTitle>
                      <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

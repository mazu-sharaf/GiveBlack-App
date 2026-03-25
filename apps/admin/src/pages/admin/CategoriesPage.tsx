import { useEffect, useState } from "react";
import { fetchCategories, createCategory, updateCategory, deleteCategory } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Grid3X3, Plus, Pencil, Trash2 } from "lucide-react";

const FA_ICON_MAP: Record<string, string> = {
  "color-palette-outline": "fa-palette",
  "megaphone-outline": "fa-bullhorn",
  "people-outline": "fa-users",
  "trending-up-outline": "fa-chart-line",
  "school-outline": "fa-school",
  "leaf-outline": "fa-leaf",
  "star-outline": "fa-star",
  "heart-outline": "fa-heart",
  "home-outline": "fa-house",
  "happy-outline": "fa-face-smile",
};

interface CategoryItem {
  id: string;
  name: string;
  icon: string;
  color: string;
  count: number;
  image_url?: string | null;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<CategoryItem | null>(null);
  const [form, setForm] = useState({ name: "", icon: "", color: "#2ECC71" });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchCategories();
      setCategories(res.categories || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditItem(null);
    setForm({ name: "", icon: "", color: "#2ECC71" });
    setDialogOpen(true);
  };

  const openEdit = (cat: CategoryItem) => {
    setEditItem(cat);
    setForm({ name: cat.name, icon: cat.icon || "", color: cat.color || "#2ECC71" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    try {
      if (editItem) {
        await updateCategory(editItem.id, form);
        toast.success("Category updated");
      } else {
        await createCategory(form);
        toast.success("Category created");
      }
      setDialogOpen(false);
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Operation failed");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCategory(id);
      toast.success("Category deleted");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Operation failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Grid3X3 className="h-6 w-6" /> Categories</h2>
          <p className="text-sm text-muted-foreground mt-1">{categories.length} categories</p>
        </div>
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1" /> New Category
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <Card key={cat.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: (cat.color || "#2ECC71") + "20", color: cat.color || "#2ECC71" }}>
                    {(() => {
                      const iconVal = (cat.icon || "").trim();
                      if (!iconVal) return cat.name.charAt(0);
                      const faIcon =
                        iconVal.startsWith("fa-")
                          ? iconVal
                          : FA_ICON_MAP[iconVal] ||
                            (!iconVal.includes("outline") && iconVal.includes("-") ? `fa-${iconVal}` : "");
                      if (faIcon) return <i className={`fa-solid ${faIcon}`} aria-hidden="true" />;
                      // If it's a short "emoji/letter", show it directly.
                      if (iconVal.length > 0 && iconVal.length <= 4) return iconVal;
                      return cat.name.charAt(0);
                    })()}
                  </div>
                  <div>
                    <p className="font-medium">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">{cat.count} organizations</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cat)}>
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
                        <AlertDialogTitle>Delete "{cat.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>This will remove the category. Organizations using it will become uncategorized.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(cat.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
          {categories.length === 0 && (
            <div className="col-span-full text-center py-8 text-muted-foreground">No categories yet</div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Icon (emoji, letter, or Font Awesome name)</Label>
              <Input
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="e.g. fa-heart, 🎓, E"
              />
              <p className="text-xs text-muted-foreground">
                To use Font Awesome, enter a solid icon name like <code>fa-heart</code> or <code>fa-graduation-cap</code>.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="h-10 w-10 rounded cursor-pointer border-0" />
                <Input value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="flex-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

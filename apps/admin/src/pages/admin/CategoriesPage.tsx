import { useEffect, useState, useRef, type ChangeEvent } from "react";
import { fetchCategories, createCategory, updateCategory, deleteCategory, uploadFile, resolveImageUrl } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Grid3X3, Plus, Pencil, Trash2, ImagePlus, X } from "lucide-react";

/** Default for icon circle bg, border, and letter: new categories and admin previews. */
const DEFAULT_CATEGORY_THEME = "#059669";

interface CategoryItem {
  id: string;
  name: string;
  icon: string;
  color: string;
  count: number;
  image_url?: string | null;
  icon_bg_color?: string | null;
  icon_border_color?: string | null;
}

type CategoryForm = {
  name: string;
  color: string;
  image_url: string | null;
  icon_bg_color: string;
  icon_border_color: string;
};

const defaultForm = (): CategoryForm => ({
  name: "",
  color: DEFAULT_CATEGORY_THEME,
  image_url: null,
  icon_bg_color: DEFAULT_CATEGORY_THEME,
  icon_border_color: DEFAULT_CATEGORY_THEME,
});

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<CategoryItem | null>(null);
  const [form, setForm] = useState<CategoryForm>(defaultForm);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditItem(null);
    setForm(defaultForm());
    setDialogOpen(true);
  };

  const openEdit = (cat: CategoryItem) => {
    setEditItem(cat);
    setForm({
      name: cat.name,
      color: cat.color || DEFAULT_CATEGORY_THEME,
      image_url: cat.image_url ?? null,
      icon_bg_color: cat.icon_bg_color || DEFAULT_CATEGORY_THEME,
      icon_border_color: cat.icon_border_color || DEFAULT_CATEGORY_THEME,
    });
    setDialogOpen(true);
  };

  const handlePickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadFile(file, "category-icon");
      if (!url) throw new Error("No URL returned");
      setForm((f) => ({ ...f, image_url: url }));
      toast.success("Image uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      const payload = {
        name: form.name.trim(),
        color: form.color,
        image_url: form.image_url,
        icon_bg_color: form.icon_bg_color,
        icon_border_color: form.icon_border_color,
      };
      if (editItem) {
        await updateCategory(editItem.id, payload);
        toast.success("Category updated");
      } else {
        await createCategory(payload);
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

  function CategoryAvatar({ cat }: { cat: CategoryItem }) {
    const src = resolveImageUrl(cat.image_url);
    const initial = (cat.name || "?").trim().charAt(0).toUpperCase();
    const ringBg = cat.icon_bg_color || DEFAULT_CATEGORY_THEME;
    const ringBorder = cat.icon_border_color || DEFAULT_CATEGORY_THEME;
    const letterColor = cat.color || DEFAULT_CATEGORY_THEME;
    if (src) {
      return (
        <div
          className="h-10 w-10 rounded-full overflow-hidden shrink-0 border-2 p-0.5"
          style={{ backgroundColor: ringBg, borderColor: ringBorder }}
        >
          <img src={src} alt="" className="h-full w-full rounded-full object-cover" />
        </div>
      );
    }
    return (
      <div
        className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 border-2"
        style={{ backgroundColor: ringBg, borderColor: ringBorder, color: letterColor }}
      >
        {initial}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Grid3X3 className="h-6 w-6" /> Categories
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{categories.length} categories</p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-1" /> New Category
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <Card key={cat.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <CategoryAvatar cat={cat} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">{cat.count} organizations</p>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
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
                        <AlertDialogTitle>Delete &quot;{cat.name}&quot;?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove the category. Organizations using it will become uncategorized.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(cat.id)} className="bg-destructive text-destructive-foreground">
                          Delete
                        </AlertDialogAction>
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
              <Label>Category image</Label>
              <p className="text-xs text-muted-foreground">Square image works best (shown like a profile picture in the app).</p>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickFile} />
              <div className="flex items-center gap-3">
                <div
                  className="h-16 w-16 rounded-full overflow-hidden flex items-center justify-center shrink-0 border-2 p-0.5"
                  style={{ backgroundColor: form.icon_bg_color, borderColor: form.icon_border_color }}
                >
                  {form.image_url ? (
                    <img src={resolveImageUrl(form.image_url)} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <span className="text-muted-foreground text-xs px-1 text-center">No image</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                    <ImagePlus className="h-4 w-4 mr-1" />
                    {uploading ? "Uploading…" : "Upload"}
                  </Button>
                  {form.image_url ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-8"
                      onClick={() => setForm((f) => ({ ...f, image_url: null }))}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Remove image
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Icon circle background</Label>
              <p className="text-xs text-muted-foreground">Background behind the category image or letter.</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.icon_bg_color}
                  onChange={(e) => setForm((f) => ({ ...f, icon_bg_color: e.target.value }))}
                  className="h-10 w-10 rounded cursor-pointer border-0"
                />
                <Input
                  value={form.icon_bg_color}
                  onChange={(e) => setForm((f) => ({ ...f, icon_bg_color: e.target.value }))}
                  className="flex-1 font-mono text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Icon circle border</Label>
              <p className="text-xs text-muted-foreground">Ring around the category image.</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.icon_border_color}
                  onChange={(e) => setForm((f) => ({ ...f, icon_border_color: e.target.value }))}
                  className="h-10 w-10 rounded cursor-pointer border-0"
                />
                <Input
                  value={form.icon_border_color}
                  onChange={(e) => setForm((f) => ({ ...f, icon_border_color: e.target.value }))}
                  className="flex-1 font-mono text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Letter color</Label>
              <p className="text-xs text-muted-foreground">Color of the first letter when no image is set.</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-10 w-10 rounded cursor-pointer border-0"
                />
                <Input value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="flex-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-primary hover:bg-primary/90" disabled={uploading}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

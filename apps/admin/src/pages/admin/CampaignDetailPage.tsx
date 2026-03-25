import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { dbQuery, dbMutate, resolveImageUrl } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  ArrowLeft, Save, Pause, Play, XCircle, Upload, Trash2, Plus, Image as ImageIcon,
} from "lucide-react";

interface CampaignData {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  story: string | null;
  about: string | null;
  main_image_url: string | null;
  location: string | null;
  goal: number;
  raised: number;
  donor_count: number;
  status: string;
  created_at: string;
  org_name?: string;
}

interface GalleryImage {
  id: string;
  image_url: string;
  caption: string | null;
  sort_order: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  paused: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  completed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  closed: "bg-red-500/20 text-red-400 border-red-500/30",
  draft: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    story: "",
    about: "",
    main_image_url: "",
    location: "United States",
    goal: "",
    organization_id: "",
    raised: "",
    donor_count: "",
  });

  const loadCampaign = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }
    try {
      const res = await dbQuery<CampaignData>("campaigns", {
        select: "id, organization_id, title, description, story, about, main_image_url, location, goal, raised, donor_count, status, created_at",
        filters: [{ column: "id", op: "eq", value: id! }],
        limit: 1,
      });
      if (res.data?.[0]) {
        const c = res.data[0];
        setCampaign(c);
        setForm({
          title: c.title || "",
          description: c.description || "",
          story: c.story || "",
          about: c.about || "",
          main_image_url: c.main_image_url || "",
          location: c.location || "United States",
          goal: String(c.goal || 0),
          organization_id: c.organization_id || "",
          raised: String(c.raised || 0),
          donor_count: String(c.donor_count || 0),
        });
      }

      const imgRes = await dbQuery<GalleryImage>("campaign_images", {
        select: "id, image_url, caption, sort_order",
        filters: [{ column: "campaign_id", op: "eq", value: id! }],
        order: { column: "sort_order", ascending: true },
      });
      setGallery(imgRes.data || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    loadCampaign();
    dbQuery<{ id: string; name: string }>("organizations", {
      select: "id, name",
      order: { column: "name", ascending: true },
      limit: 200,
    }).then((r) => setOrganizations(r.data || []));
  }, [loadCampaign]);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!form.organization_id && isNew) {
      toast.error("Please select an organization");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        description: form.description || null,
        story: form.story || null,
        about: form.about || null,
        main_image_url: form.main_image_url || null,
        location: form.location || null,
        goal: Number(form.goal) || 0,
        raised: Number(form.raised) || 0,
        donor_count: Number(form.donor_count) || 0,
        updated_at: new Date().toISOString(),
      };

      if (isNew) {
        payload.id = `camp-${Date.now()}`;
        payload.organization_id = form.organization_id;
        payload.status = "active";
        await dbMutate("campaigns", "insert", payload);
        toast.success("Campaign created");
        navigate(`/campaigns/${payload.id}`, { replace: true });
      } else {
        await dbMutate("campaigns", "update", payload, [
          { column: "id", op: "eq", value: id! },
        ]);
        toast.success("Campaign saved");
        loadCampaign();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!campaign) return;
    const newStatus = campaign.status === "active" ? "paused" : "active";
    try {
      await dbMutate("campaigns", "update", { status: newStatus }, [
        { column: "id", op: "eq", value: id! },
      ]);
      toast.success(`Campaign ${newStatus}`);
      setCampaign((c) => (c ? { ...c, status: newStatus } : c));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const closeCampaign = async () => {
    try {
      await dbMutate("campaigns", "update", { status: "closed" }, [
        { column: "id", op: "eq", value: id! },
      ]);
      toast.success("Campaign closed");
      setCampaign((c) => (c ? { ...c, status: "closed" } : c));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to close campaign");
    }
  };

  const addGalleryImage = async () => {
    const url = prompt("Enter image URL:");
    if (!url) return;
    const caption = prompt("Enter caption (optional):") || "";
    try {
      await dbMutate("campaign_images", "insert", {
        id: `img-${Date.now()}`,
        campaign_id: id,
        org_id: campaign?.organization_id || form.organization_id,
        image_url: url,
        caption: caption || null,
        sort_order: gallery.length,
      });
      toast.success("Image added");
      loadCampaign();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add image");
    }
  };

  const removeGalleryImage = async (imgId: string) => {
    try {
      await dbMutate("campaign_images", "delete", {}, [
        { column: "id", op: "eq", value: imgId },
      ]);
      setGallery((g) => g.filter((i) => i.id !== imgId));
      toast.success("Image removed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove image");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const progress = Number(form.goal) > 0
    ? Math.min(100, (Number(form.raised || 0) / Number(form.goal)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{isNew ? "New Campaign" : form.title || "Campaign"}</h2>
          {campaign && (
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={STATUS_COLORS[campaign.status] || ""}>{campaign.status}</Badge>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {campaign && campaign.status !== "closed" && (
            <>
              <Button variant="outline" size="sm" onClick={toggleStatus}>
                {campaign.status === "active" ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                {campaign.status === "active" ? "Pause" : "Activate"}
              </Button>
              <Button variant="outline" size="sm" className="text-red-400" onClick={closeCampaign}>
                <XCircle className="h-4 w-4 mr-1" /> Close
              </Button>
            </>
          )}
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Campaign Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {isNew && (
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Organization</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 bg-background text-foreground"
                    value={form.organization_id}
                    onChange={(e) => update("organization_id", e.target.value)}
                  >
                    <option value="">Select organization...</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Title</label>
                <Input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Campaign title" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Short Description</label>
                <Input value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Brief one-line description" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Goal ($)</label>
                  <Input type="number" value={form.goal} onChange={(e) => update("goal", e.target.value)} placeholder="50000" />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Location</label>
                  <Input value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="United States" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Story</CardTitle></CardHeader>
            <CardContent>
              <textarea
                className="w-full min-h-[160px] border rounded-md px-3 py-2 bg-background text-foreground resize-y"
                value={form.story}
                onChange={(e) => update("story", e.target.value)}
                placeholder="Tell the campaign's story... What problem does it solve? How will donations be used?"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>About</CardTitle></CardHeader>
            <CardContent>
              <textarea
                className="w-full min-h-[120px] border rounded-md px-3 py-2 bg-background text-foreground resize-y"
                value={form.about}
                onChange={(e) => update("about", e.target.value)}
                placeholder="About the organization running this campaign..."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Gallery Images</CardTitle>
                {!isNew && (
                  <Button variant="outline" size="sm" onClick={addGalleryImage}>
                    <Plus className="h-4 w-4 mr-1" /> Add Image
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {gallery.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-40" />
                  <p>No gallery images yet</p>
                  {isNew && <p className="text-xs mt-1">Save the campaign first, then add gallery images</p>}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {gallery.map((img) => (
                    <div key={img.id} className="relative group rounded-lg overflow-hidden">
                      <img src={resolveImageUrl(img.image_url)} alt={img.caption || ""} className="w-full h-32 object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => removeGalleryImage(img.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {img.caption && (
                        <p className="text-xs text-muted-foreground p-1 truncate">{img.caption}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Main Image</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {form.main_image_url ? (
                <div className="relative rounded-lg overflow-hidden">
                  <img src={resolveImageUrl(form.main_image_url)} alt="Main" className="w-full h-48 object-cover" />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8"
                    onClick={() => update("main_image_url", "")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
                  <Upload className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No main image</p>
                </div>
              )}
              <Input
                value={form.main_image_url}
                onChange={(e) => update("main_image_url", e.target.value)}
                placeholder="Image URL"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Raised Funds</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Amount Raised ($)</label>
                <Input
                  type="number"
                  value={form.raised}
                  onChange={(e) => update("raised", e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Donor Count</label>
                <Input
                  type="number"
                  value={form.donor_count}
                  onChange={(e) => update("donor_count", e.target.value)}
                  placeholder="0"
                />
              </div>
              {!isNew && (
                <>
                  <Progress value={progress} className="h-3" />
                  <p className="text-center text-sm text-muted-foreground">{progress.toFixed(1)}% of ${Number(form.goal || 0).toLocaleString()} goal</p>
                </>
              )}
              <p className="text-xs text-muted-foreground">Set the initial raised amount for campaigns already in progress. Future donations via the app will add to this total.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

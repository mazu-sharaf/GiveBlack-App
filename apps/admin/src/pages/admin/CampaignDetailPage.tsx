import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { dbQuery, dbMutate, deleteAdminCampaign, resolveImageUrl, uploadFile } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { getCurrentRole } from "@/lib/admin-auth";
import {
  ArrowLeft, Save, Pause, Play, XCircle, Upload, Trash2, Plus, Image as ImageIcon,
  Share2, Copy, ExternalLink,
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
  featured?: boolean;
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

function isLocalGalleryId(id: string): boolean {
  return id.startsWith("local-");
}

function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Please choose an image file.";
  if (file.size > 8 * 1024 * 1024) return "Image must be 8MB or smaller.";
  return null;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-primary/20 text-primary border-primary/30",
  paused: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  completed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  closed: "bg-red-500/20 text-red-400 border-red-500/30",
  draft: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  pending_review: "bg-violet-500/20 text-violet-300 border-violet-500/30",
};

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new";
  const role = getCurrentRole();
  const canDelete = role === "admin" || role === "super_admin";
  const canFeature = canDelete;
  const newCampaignIdRef = useRef<string>("");
  const mainImageInputRef = useRef<HTMLInputElement>(null);
  const galleryImageInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [campaign, setCampaign] = useState<CampaignData | null>(null);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [galleryUrlDraft, setGalleryUrlDraft] = useState("");
  const [galleryCaptionDraft, setGalleryCaptionDraft] = useState("");
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
    featured: false,
  });

  const loadCampaign = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }
    try {
      const res = await dbQuery<CampaignData>("campaigns", {
        select: "id, organization_id, title, description, story, about, main_image_url, location, featured, goal, raised, donor_count, status, created_at",
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
          featured: Boolean(c.featured),
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

  useEffect(() => {
    if (isNew && !newCampaignIdRef.current) {
      newCampaignIdRef.current = `camp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }, [isNew]);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const updateBool = (key: string, value: boolean) => setForm((f) => ({ ...f, [key]: value }));

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
        featured: Boolean(form.featured),
        goal: Number(form.goal) || 0,
        raised: Number(form.raised) || 0,
        donor_count: Number(form.donor_count) || 0,
        updated_at: new Date().toISOString(),
      };

      if (isNew) {
        const cid = newCampaignIdRef.current || `camp-${Date.now()}`;
        payload.id = cid;
        payload.organization_id = form.organization_id;
        // Save as pending_review so publish is an explicit action.
        payload.status = "pending_review";
        await dbMutate("campaigns", "insert", payload);
        if (gallery.length > 0) {
          await Promise.all(
            gallery.map((img, i) =>
              dbMutate("campaign_images", "insert", {
                id: `img-${cid}-${i}-${Date.now()}`,
                campaign_id: cid,
                org_id: form.organization_id,
                image_url: img.image_url,
                caption: img.caption || null,
                sort_order: i,
              })
            )
          );
        }
        toast.success("Campaign saved (not published yet)");
        navigate(`/campaigns/${cid}`, { replace: true });
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

  const publishCampaign = async () => {
    try {
      // If this is a brand new campaign, create it as pending_review first so the
      // pending_review -> active transition triggers donor notifications.
      if (isNew) {
        if (!form.title.trim()) {
          toast.error("Title is required");
          return;
        }
        if (!form.organization_id) {
          toast.error("Please select an organization");
          return;
        }
        setSaving(true);
        const cid = newCampaignIdRef.current || `camp-${Date.now()}`;
        const payload: Record<string, unknown> = {
          id: cid,
          organization_id: form.organization_id,
          title: form.title,
          description: form.description || null,
          story: form.story || null,
          about: form.about || null,
          main_image_url: form.main_image_url || null,
          location: form.location || null,
          featured: Boolean(form.featured),
          goal: Number(form.goal) || 0,
          raised: Number(form.raised) || 0,
          donor_count: Number(form.donor_count) || 0,
          status: "pending_review",
          updated_at: new Date().toISOString(),
        };
        await dbMutate("campaigns", "insert", payload);
        if (gallery.length > 0) {
          await Promise.all(
            gallery.map((img, i) =>
              dbMutate("campaign_images", "insert", {
                id: `img-${cid}-${i}-${Date.now()}`,
                campaign_id: cid,
                org_id: form.organization_id,
                image_url: img.image_url,
                caption: img.caption || null,
                sort_order: i,
              })
            )
          );
        }
        await dbMutate(
          "campaigns",
          "update",
          { status: "active", updated_at: new Date().toISOString() },
          [{ column: "id", op: "eq", value: cid }]
        );
        toast.success("Campaign published. It is now live for donations.");
        navigate(`/campaigns/${cid}`, { replace: true });
        return;
      }

      if (!campaign) return;
      await dbMutate(
        "campaigns",
        "update",
        { status: "active", updated_at: new Date().toISOString() },
        [{ column: "id", op: "eq", value: id! }]
      );
      toast.success("Campaign published. It is now live for donations.");
      setCampaign((c) => (c ? { ...c, status: "active" } : c));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to publish");
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

  const appendGalleryItem = (imageUrl: string, caption: string | null) => {
    const trimmed = imageUrl.trim();
    if (!trimmed) {
      toast.error("Add an image URL or upload a file");
      return;
    }
    setGallery((g) => [
      ...g,
      {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        image_url: trimmed,
        caption: caption?.trim() || null,
        sort_order: g.length,
      },
    ]);
    setGalleryUrlDraft("");
    setGalleryCaptionDraft("");
  };

  const addGalleryFromDrafts = async () => {
    const caption = galleryCaptionDraft.trim() || null;
    if (isNew) {
      if (!galleryUrlDraft.trim()) {
        toast.error("Enter an image URL or use Upload");
        return;
      }
      appendGalleryItem(galleryUrlDraft, caption);
      toast.success("Image added. Save the campaign to publish it.");
      return;
    }
    if (!id) return;
    const url = galleryUrlDraft.trim();
    if (!url) {
      toast.error("Enter an image URL or use Upload");
      return;
    }
    try {
      await dbMutate("campaign_images", "insert", {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        campaign_id: id,
        org_id: campaign?.organization_id || form.organization_id,
        image_url: url,
        caption,
        sort_order: gallery.length,
      });
      toast.success("Image added");
      setGalleryUrlDraft("");
      setGalleryCaptionDraft("");
      loadCampaign();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add image");
    }
  };

  const processGalleryPickedFile = async (file: File) => {
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setUploadingGallery(true);
    try {
      const url = await uploadFile(file);
      if (!url) throw new Error("Upload failed");
      const caption = galleryCaptionDraft.trim() || null;
      if (isNew) {
        appendGalleryItem(url, caption);
        toast.success("Image uploaded. Save the campaign to publish it.");
      } else {
        await dbMutate("campaign_images", "insert", {
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          campaign_id: id!,
          org_id: campaign?.organization_id || form.organization_id,
          image_url: url,
          caption,
          sort_order: gallery.length,
        });
        setGalleryCaptionDraft("");
        toast.success("Image uploaded");
        loadCampaign();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingGallery(false);
    }
  };

  const handleGalleryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await processGalleryPickedFile(file);
  };

  const handleGalleryDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processGalleryPickedFile(file);
  };

  const processMainPickedFile = async (file: File) => {
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setUploadingMain(true);
    try {
      const url = await uploadFile(file);
      if (!url) throw new Error("Upload failed");
      update("main_image_url", url);
      toast.success("Main image uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingMain(false);
    }
  };

  const handleMainImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await processMainPickedFile(file);
  };

  const handleMainImageDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processMainPickedFile(file);
  };

  const removeGalleryImage = async (imgId: string) => {
    if (isLocalGalleryId(imgId)) {
      setGallery((g) => g.filter((i) => i.id !== imgId));
      return;
    }
    try {
      await dbMutate("campaign_images", "delete", {}, [{ column: "id", op: "eq", value: imgId }]);
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

  const campaignPublicUrl = (campaignId: string): string => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin.replace(/\/$/, "")}/c/${encodeURIComponent(campaignId)}`;
  };

  const handleCopyPublicLink = async () => {
    if (!campaign) return;
    const url = campaignPublicUrl(campaign.id);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Campaign link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const handleSharePublicLink = async () => {
    if (!campaign) return;
    const url = campaignPublicUrl(campaign.id);
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (navigator as any).share({
          title: form.title || "GiveBlack campaign",
          text: `Support ${form.title || "this campaign"} on GiveBlack!`,
          url,
        });
        return;
      }
    } catch {
      // fallthrough
    }
    await handleCopyPublicLink();
  };

  const handleOpenPublicLink = () => {
    if (!campaign) return;
    const url = campaignPublicUrl(campaign.id);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl sm:text-2xl font-bold leading-tight break-words">
              {isNew ? "New Campaign" : form.title || "Campaign"}
            </h2>
            {campaign && (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={STATUS_COLORS[campaign.status] || ""}>{campaign.status}</Badge>
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          {campaign?.status === "active" && (
            <>
              <Button variant="outline" size="sm" onClick={() => void handleSharePublicLink()}>
                <Share2 className="h-4 w-4 mr-1" /> Share
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleCopyPublicLink()}>
                <Copy className="h-4 w-4 mr-1" /> Copy link
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenPublicLink}>
                <ExternalLink className="h-4 w-4 mr-1" /> Open
              </Button>
            </>
          )}
          {campaign && campaign.status !== "closed" && (
            <>
              {campaign.status === "pending_review" ? (
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={publishCampaign}>
                  Publish
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={toggleStatus}>
                  {campaign.status === "active" ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                  {campaign.status === "active" ? "Pause" : "Activate"}
                </Button>
              )}
              <Button variant="outline" size="sm" className="text-red-400" onClick={closeCampaign}>
                <XCircle className="h-4 w-4 mr-1" /> Close
              </Button>
            </>
          )}
          {campaign && canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete campaign permanently?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cannot be undone. Campaigns with donations cannot be permanently deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground"
                    onClick={() => {
                      void (async () => {
                        try {
                          await deleteAdminCampaign(campaign.id, { force: true });
                          toast.success("Campaign deleted");
                          navigate("/campaigns");
                        } catch (e: unknown) {
                          toast.error(e instanceof Error ? e.message : "Delete failed");
                        }
                      })();
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {isNew ? (
            <>
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save"}
              </Button>
              <Button className="bg-violet-600 hover:bg-violet-700" onClick={publishCampaign} disabled={saving}>
                Publish
              </Button>
            </>
          ) : (
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Campaign Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!isNew && (
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">Featured</div>
                    <div className="text-xs text-muted-foreground">Show this campaign in the featured slider</div>
                  </div>
                  <Switch
                    checked={Boolean(form.featured)}
                    disabled={!canFeature}
                    onCheckedChange={(v) => updateBool("featured", v)}
                  />
                </div>
              )}
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Organization</label>
                <select
                  className="w-full border rounded-md px-3 py-2 bg-background text-foreground disabled:opacity-70"
                  aria-label="Organization"
                  value={form.organization_id}
                  onChange={(e) => update("organization_id", e.target.value)}
                  disabled={!isNew}
                  title={!isNew ? "Organization cannot be changed after creation" : undefined}
                >
                  <option value="">Select organization...</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                {!isNew && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Organization cannot be changed after creation.
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Title</label>
                <Input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Campaign title" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Short Description</label>
                <Input value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Brief one-line description" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <CardTitle>Gallery Images</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="rounded-lg border-2 border-dashed border-primary/25 bg-muted/20 p-4 space-y-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => void handleGalleryDrop(e)}
              >
                <p className="text-sm text-muted-foreground">
                  {isNew
                    ? "Add images now. They are stored with the campaign when you click Save. You can paste a URL or upload a file (drag-and-drop supported)."
                    : "Paste a URL, upload, or drop an image file to add to the gallery."}
                </p>
                <input
                  ref={galleryImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-label="Upload gallery image"
                  title="Upload gallery image"
                  onChange={(e) => void handleGalleryFile(e)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingGallery}
                    onClick={() => galleryImageInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    {uploadingGallery ? "Uploading…" : "Upload image"}
                  </Button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <Input
                    placeholder="Image URL"
                    value={galleryUrlDraft}
                    onChange={(e) => setGalleryUrlDraft(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Caption (optional)"
                    value={galleryCaptionDraft}
                    onChange={(e) => setGalleryCaptionDraft(e.target.value)}
                    className="sm:max-w-[220px]"
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={() => void addGalleryFromDrafts()} disabled={uploadingGallery}>
                    <Plus className="h-4 w-4 mr-1" /> Add to gallery
                  </Button>
                </div>
              </div>

              {gallery.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No gallery images yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {gallery.map((img) => (
                    <div key={img.id} className="relative group rounded-lg overflow-hidden border border-border">
                      <img src={resolveImageUrl(img.image_url)} alt={img.caption || ""} className="w-full h-32 object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => void removeGalleryImage(img.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {img.caption && <p className="text-xs text-muted-foreground p-1 truncate">{img.caption}</p>}
                      {isLocalGalleryId(img.id) && (
                        <p className="text-[10px] uppercase tracking-wide text-amber-500/90 px-1 pb-1">Pending save</p>
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
              <input
                ref={mainImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Upload main image"
                title="Upload main image"
                onChange={(e) => void handleMainImageFile(e)}
              />
              {form.main_image_url ? (
                <div className="relative rounded-lg overflow-hidden border border-border">
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
                <button
                  type="button"
                  className="w-full border-2 border-dashed border-primary/25 rounded-lg p-8 text-center text-muted-foreground hover:border-primary/45 hover:bg-muted/30 transition-colors relative disabled:opacity-60"
                  onClick={() => mainImageInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => void handleMainImageDrop(e)}
                  disabled={uploadingMain}
                >
                  {uploadingMain ? (
                    <p className="text-sm">Uploading…</p>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No main image. Click to upload or paste a URL below.</p>
                    </>
                  )}
                </button>
              )}
              <div className="flex gap-2">
                <Input
                  value={form.main_image_url}
                  onChange={(e) => update("main_image_url", e.target.value)}
                  placeholder="Image URL"
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" disabled={uploadingMain} onClick={() => mainImageInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1" />
                  {uploadingMain ? "…" : "Upload"}
                </Button>
              </div>
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

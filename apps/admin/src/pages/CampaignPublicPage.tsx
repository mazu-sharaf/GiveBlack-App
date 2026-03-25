import { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DonationSplitPreview } from "@/components/DonationSplitPreview";
import { Heart, Users, Share2, Copy, Check, ExternalLink, Loader2, Twitter, Facebook, MessageCircle } from "lucide-react";
import { toast } from "sonner";

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

/** Default share image when a campaign has no hero or org artwork (matches `index.html` OG). */
const DEFAULT_SHARE_OG = "https://giveblackapp.com/admin/giveblack-og.png";

function resolveMediaUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

interface Campaign {
  id: string;
  title: string;
  description: string;
  story: string | null;
  about: string | null;
  main_image_url: string | null;
  location: string | null;
  goal: number;
  raised: number;
  donor_count: number;
  status: string;
  organization_id: string;
  org_name: string;
  org_image_url: string | null;
  org_initials: string;
  org_image_color: string;
  category_id: string | null;
  org_verified: boolean;
  org_description: string | null;
  gallery: GalleryImage[];
}

interface GalleryImage {
  id: string;
  image_url: string;
  caption: string | null;
  sort_order: number;
}

export default function CampaignPublicPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [donateAmount, setDonateAmount] = useState(25);
  const [showSplits, setShowSplits] = useState(false);
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [donorMessage, setDonorMessage] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/campaigns/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setCampaign(data);
        }
      } catch {
        // campaign not found
      }
      setLoading(false);
    };
    load();
  }, [slug]);

  useEffect(() => {
    if (searchParams.get("donation") === "success") {
      toast.success("Thank you for your donation!");
    } else if (searchParams.get("donation") === "canceled") {
      toast.info("Donation was canceled.");
    }
  }, [searchParams]);

  const handleDonate = async () => {
    if (!campaign) return;
    setCheckoutLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/payments/public-donate-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          orgId: campaign.organization_id,
          amount: donateAmount,
          donorName: isAnonymous ? "" : donorName,
          donorEmail: isAnonymous ? "" : donorEmail,
          message: donorMessage,
          isAnonymous,
        }),
      });
      const result = await res.json();
      if (result.url) {
        window.location.href = result.url;
      } else {
        toast.error(result.error || "Failed to start checkout");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start checkout");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const progressPct = campaign ? Math.min((campaign.raised / (campaign.goal || 1)) * 100, 100) : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading campaign...</div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Campaign not found</h1>
        <p className="text-muted-foreground">This campaign link may be invalid or expired.</p>
        <Link to="/">
          <Button variant="outline">Go Home</Button>
        </Link>
      </div>
    );
  }

  const isCompleted = campaign.status === "completed";
  const presetAmounts = [10, 25, 50, 100, 250, 500];

  const ogDescription = campaign.description
    ? campaign.description.slice(0, 155)
    : `Support ${campaign.title} on Give Black — $${Number(campaign.raised).toLocaleString()} raised so far.`;

  const shareOgImage =
    resolveMediaUrl(campaign.main_image_url) ||
    resolveMediaUrl(campaign.org_image_url) ||
    DEFAULT_SHARE_OG;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{`${campaign.title} — Give Black`}</title>
        <meta name="description" content={ogDescription} />
        <meta property="og:title" content={`Support ${campaign.title} on Give Black`} />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={shareUrl} />
        <meta property="og:image" content={shareOgImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`Support ${campaign.title} on Give Black`} />
        <meta name="twitter:description" content={ogDescription} />
        <meta name="twitter:image" content={shareOgImage} />
      </Helmet>

      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img
              src={`${import.meta.env.BASE_URL}giveblack-icon.jpg`}
              alt=""
              aria-hidden
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg object-cover border border-border shrink-0"
            />
            <span className="font-bold text-lg">Give Black</span>
          </Link>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 mr-1" /> : <Share2 className="h-4 w-4 mr-1" />}
            {copied ? "Copied!" : "Share"}
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 space-y-6">
            <div className="relative rounded-2xl overflow-hidden aspect-video">
              {campaign.main_image_url ? (
                <img src={campaign.main_image_url?.startsWith("http") ? campaign.main_image_url : `${API_URL}${campaign.main_image_url}`} alt={campaign.title} className="w-full h-full object-cover" />
              ) : campaign.org_image_url ? (
                <img src={campaign.org_image_url?.startsWith("http") ? campaign.org_image_url : `${API_URL}${campaign.org_image_url}`} alt={campaign.org_name} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ backgroundColor: campaign.org_image_color }}
                >
                  <span className="text-6xl font-bold text-white/90">{campaign.org_initials}</span>
                </div>
              )}
            </div>

            {campaign.gallery && campaign.gallery.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">Photos</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {campaign.gallery.map((img) => (
                    <div key={img.id} className="rounded-lg overflow-hidden aspect-square bg-muted">
                      <img src={img.image_url?.startsWith("http") ? img.image_url : `${API_URL}${img.image_url}`} alt={img.caption || "Campaign photo"} className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h1 className="text-3xl font-bold">{campaign.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">by {campaign.org_name}</p>
              {campaign.location && (
                <p className="text-sm text-muted-foreground mt-1">{campaign.location}</p>
              )}
            </div>

            <div className="prose prose-sm max-w-none text-muted-foreground leading-relaxed">
              <p>{campaign.description || "This campaign is making a difference. Your donation directly supports their mission."}</p>
            </div>

            {campaign.story && (
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Our Story</h2>
                <div className="prose prose-sm max-w-none text-muted-foreground leading-relaxed">
                  <p>{campaign.story}</p>
                </div>
              </div>
            )}

            {campaign.about && (
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">About</h2>
                <div className="prose prose-sm max-w-none text-muted-foreground leading-relaxed">
                  <p>{campaign.about}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="h-4 w-4" />
                <span><strong className="text-foreground">{campaign.donor_count}</strong> donors</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Heart className="h-4 w-4" />
                <span><strong className="text-foreground">${Number(campaign.raised).toLocaleString()}</strong> raised</span>
              </div>
            </div>

            <Card>
              <CardContent className="py-4 space-y-3">
                <p className="text-sm font-medium">Share this campaign</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-md px-3 py-2 text-sm text-muted-foreground truncate">
                    {shareUrl}
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Support ${campaign.title} on Give Black!`)}&url=${encodeURIComponent(shareUrl)}`, "_blank")}
                  >
                    <Twitter className="h-4 w-4 mr-1.5" /> Twitter
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank")}
                  >
                    <Facebook className="h-4 w-4 mr-1.5" /> Facebook
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Support ${campaign.title} on Give Black! ${shareUrl}`)}`, "_blank")}
                  >
                    <MessageCircle className="h-4 w-4 mr-1.5" /> WhatsApp
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <Card className="sticky top-8">
              <CardContent className="pt-6 space-y-5">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-primary text-lg">${Number(campaign.raised).toLocaleString()}</span>
                    <span className="text-muted-foreground">of ${Number(campaign.goal).toLocaleString()}</span>
                  </div>
                  <Progress value={progressPct} className="h-3" />
                  <p className="text-xs text-muted-foreground">{progressPct.toFixed(0)}% funded</p>
                </div>

                {isCompleted && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3">
                    <Check className="h-5 w-5 text-emerald-500 shrink-0" />
                    <p className="text-sm font-semibold text-emerald-500">Campaign Goal Reached</p>
                  </div>
                )}

                <Separator />

                {!isCompleted && (<>
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Select amount</p>
                    <div className="grid grid-cols-3 gap-2">
                      {presetAmounts.map((amt) => (
                        <Button
                          key={amt}
                          variant={donateAmount === amt ? "default" : "outline"}
                          size="sm"
                          onClick={() => setDonateAmount(amt)}
                          className="text-sm"
                        >
                          ${amt}
                        </Button>
                      ))}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <input
                        type="number"
                        value={donateAmount}
                        onChange={(e) => setDonateAmount(Math.max(1, Number(e.target.value)))}
                        className="w-full h-10 rounded-md border border-input bg-background pl-7 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        min={1}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => setShowSplits(!showSplits)}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {showSplits ? "Hide breakdown" : "See where your money goes"}
                  </button>

                  {showSplits && (
                    <DonationSplitPreview
                      amount={donateAmount}
                      orgAbsorbsFees={false}
                      showControls={true}
                    />
                  )}

                  <Separator />

                  <div className="space-y-3">
                    <p className="text-sm font-medium">Your information</p>
                    {!isAnonymous && (
                      <>
                        <Input
                          placeholder="Email address *"
                          type="email"
                          value={donorEmail}
                          onChange={(e) => setDonorEmail(e.target.value)}
                        />
                        <Input
                          placeholder="Your name (optional)"
                          value={donorName}
                          onChange={(e) => setDonorName(e.target.value)}
                        />
                      </>
                    )}
                    <Textarea
                      placeholder="Leave a message (optional)"
                      value={donorMessage}
                      onChange={(e) => setDonorMessage(e.target.value)}
                      rows={2}
                    />
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="anonymous"
                        checked={isAnonymous}
                        onCheckedChange={(v) => setIsAnonymous(v === true)}
                      />
                      <Label htmlFor="anonymous" className="text-sm text-muted-foreground">
                        Donate anonymously
                      </Label>
                    </div>
                  </div>

                  <Button
                    className="w-full h-12 text-base font-semibold"
                    size="lg"
                    onClick={handleDonate}
                    disabled={checkoutLoading}
                  >
                    {checkoutLoading ? (
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    ) : (
                      <Heart className="h-5 w-5 mr-2" />
                    )}
                    {checkoutLoading ? "Redirecting..." : `Donate $${donateAmount.toLocaleString()}`}
                  </Button>

                  <p className="text-[11px] text-center text-muted-foreground leading-tight">
                    Your donation is secure and processed through Stripe.
                  </p>
                </>)}

                {isCompleted && (
                  <p className="text-sm text-center text-emerald-500 font-medium">
                    This campaign has been fully funded. Thank you to all donors!
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <footer className="border-t border-border mt-16 py-6">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-muted-foreground">
          Powered by <strong>Give Black</strong> — reinvesting in Black education
        </div>
      </footer>
    </div>
  );
}

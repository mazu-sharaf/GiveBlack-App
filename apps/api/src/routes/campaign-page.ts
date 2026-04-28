import type { FastifyPluginAsync } from "fastify";
import { db } from "../lib/db.js";
import { env } from "../config/env.js";
import { getStripe } from "../services/stripe.js";
import { stripeId } from "../lib/stripe-ids.js";
import { z } from "zod";

const publicDonateSchema = z.object({
  campaignId: z.string().min(1),
  orgId: z.string().min(1),
  amount: z.coerce.number().positive(),
  currency: z.string().default("usd"),
  donorName: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().max(500).optional()
  ),
  donorEmail: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().email().optional()),
  message: z.string().max(2000).optional(),
  isAnonymous: z.boolean().default(false),
});

async function optionalDonorUserId(
  app: { jwt: { verify: (t: string) => Promise<unknown> } },
  request: { headers: { authorization?: string } }
): Promise<string | null> {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  try {
    const decoded = (await app.jwt.verify(token)) as { sub?: string; role?: string };
    if (decoded.role === "donor" && decoded.sub) return decoded.sub;
    return null;
  } catch {
    return null;
  }
}

export const campaignPageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/link/c/:campaignId", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const proto = (request.headers["x-forwarded-proto"] as string) || request.protocol || "https";
    const host = (request.headers["x-forwarded-host"] as string) || request.hostname;
    const baseUrl = `${proto}://${host}`;
    const publicBase = env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || baseUrl;
    const defaultOg = `${baseUrl.replace(/\/$/, "")}${DEFAULT_CAMPAIGN_OG_PATH}`;
    const shareUrl = `${baseUrl}/link/c/${encodeURIComponent(campaignId)}`;

    try {
      const campRes = await db.query(
        `SELECT c.title, c.description, c.main_image_url, o.name AS org_name
         FROM campaigns c
         JOIN organizations o ON o.id = c.organization_id
         WHERE c.id = $1
         LIMIT 1`,
        [campaignId]
      );
      const row =
        (campRes.rows[0] as
          | { title?: string; description?: string | null; org_name?: string; main_image_url?: string | null }
          | undefined) || {};
      const title = row.title || "Campaign";
      const desc =
        stripHtmlForMeta(row.description || `Support ${row.org_name || "this organization"} on Give Black.`).slice(0, 300);

      const appleUrl = env.APP_STORE_URL || "https://apps.apple.com/app/giveblack";
      const playUrl = env.PLAY_STORE_URL || "https://play.google.com/store/apps/details?id=com.giveblack";
      const deepLink = `giveblack://link/c/${encodeURIComponent(campaignId)}`;
      const webFallback = `${baseUrl}/c/${encodeURIComponent(campaignId)}/web`;

      return reply.type("text/html").send(
        deepLinkLandingPage({
          title,
          description: desc,
          ogTitle: `Support ${title} on Give Black`,
          ogDescription: desc,
          ogImage: resolveCampaignOgImage(row.main_image_url, publicBase, defaultOg),
          canonicalUrl: shareUrl,
          deepLink,
          webFallback,
          appleUrl,
          playUrl,
        })
      );
    } catch (e) {
      app.log.error(e);
      const appleUrl = env.APP_STORE_URL || "https://apps.apple.com/app/giveblack";
      const playUrl = env.PLAY_STORE_URL || "https://play.google.com/store/apps/details?id=com.giveblack";
      const deepLink = `giveblack://link/c/${encodeURIComponent(campaignId)}`;
      const webFallback = `${baseUrl}/c/${encodeURIComponent(campaignId)}/web`;
      return reply.type("text/html").send(
        deepLinkLandingPage({
          title: "Give Black",
          description: "Open the GiveBlack app to view this campaign.",
          ogTitle: "Give Black",
          ogDescription: "Open the GiveBlack app to view this campaign.",
          ogImage: defaultOg,
          canonicalUrl: shareUrl,
          deepLink,
          webFallback,
          appleUrl,
          playUrl,
        })
      );
    }
  });

  app.get("/c/:campaignId/thank-you", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const q = request.query as { session_id?: string };
    const proto = (request.headers["x-forwarded-proto"] as string) || request.protocol || "https";
    const host = (request.headers["x-forwarded-host"] as string) || request.hostname;
    const baseUrl = `${proto}://${host}`;

    const campRes = await db.query(
      `SELECT c.title, o.name as org_name FROM campaigns c JOIN organizations o ON c.organization_id = o.id WHERE c.id = $1`,
      [campaignId]
    );
    const camp = campRes.rows[0] as any || { title: "Campaign", org_name: "Organization" };

    let amount = 0;
    let currency = "usd";
    let donorName = "Donor";
    let isAnonymous = false;
    let reference = "";
    let donationId = "";
    let donorEmailHint: string | null = null;

    if (q.session_id) {
      try {
        const stripe = getStripe();
        if (stripe) {
          const session = await stripe.checkout.sessions.retrieve(q.session_id);
          amount = typeof session.amount_total === "number" ? session.amount_total / 100 : 0;
          currency = session.currency || "usd";

          const piId = typeof session.payment_intent === "string" ? session.payment_intent : null;
          const sid = session.id;
          const donRes = await db.query(
            `SELECT donor_name, donor_email, is_anonymous, id, campaign_id
             FROM donations
             WHERE campaign_id = $1
               AND (stripe_payment_intent_id = $2 OR ($3::text IS NOT NULL AND stripe_payment_intent_id = $3))
             LIMIT 1`,
            [campaignId, sid, piId]
          );
          if (donRes.rows.length) {
            const d = donRes.rows[0] as {
              donor_name: string | null;
              donor_email: string | null;
              is_anonymous: boolean;
              id: string;
              campaign_id: string | null;
            };
            donorName = d.is_anonymous ? "Anonymous" : (d.donor_name || "Donor");
            isAnonymous = d.is_anonymous;
            reference = String(d.id).substring(0, 8).toUpperCase();
            donationId = String(d.id || "");
            donorEmailHint = d.is_anonymous ? null : d.donor_email || null;
          }
        }
      } catch {}
    }

    const appleUrl = env.APP_STORE_URL || "https://apps.apple.com/app/giveblack";
    const playUrl = env.PLAY_STORE_URL || "https://play.google.com/store/apps/details?id=com.giveblack";
    const loginUrl = env.DONOR_LOGIN_WEB_URL || "https://giveblackapp.com/";

    return reply
      .type("text/html")
      .send(
        thankYouPage(
          camp,
          amount,
          currency,
          donorName,
          isAnonymous,
          reference,
          donationId,
          baseUrl,
          campaignId,
          donorEmailHint,
          appleUrl,
          playUrl,
          loginUrl
        )
      );
  });

  app.get("/c/:campaignId", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const proto = (request.headers["x-forwarded-proto"] as string) || request.protocol || "https";
    const host = (request.headers["x-forwarded-host"] as string) || request.hostname;
    const baseUrl = `${proto}://${host}`;
    const publicBase = env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || baseUrl;
    const defaultOg = `${baseUrl.replace(/\/$/, "")}${DEFAULT_CAMPAIGN_OG_PATH}`;

    try {
      const campRes = await db.query(
        `SELECT c.title, c.description, c.main_image_url, o.name AS org_name
         FROM campaigns c
         JOIN organizations o ON o.id = c.organization_id
         WHERE c.id = $1
         LIMIT 1`,
        [campaignId]
      );
      if (!campRes.rows.length) {
        return reply.type("text/html").send(notFoundPage());
      }
      const row = campRes.rows[0] as {
        title: string;
        description: string | null;
        main_image_url: string | null;
        org_name: string;
      };
      const plainDesc = stripHtmlForMeta(
        row.description || `Support ${row.org_name} on Give Black: ${row.title}.`
      ).slice(0, 300);
      const pageTitle = `Support ${row.title} on Give Black`;
      const ogImage = resolveCampaignOgImage(row.main_image_url, publicBase, defaultOg);
      const canonicalUrl = `${baseUrl}/c/${encodeURIComponent(campaignId)}`;
      const webCampaignUrl = `${baseUrl}/c/${encodeURIComponent(campaignId)}/web`;
      const brandIconUrl = `${baseUrl.replace(/\/$/, "")}/admin/giveblack-icon.png`;

      const appleUrl = env.APP_STORE_URL || "https://apps.apple.com/app/giveblack";
      const playUrl = env.PLAY_STORE_URL || "https://play.google.com/store/apps/details?id=com.giveblack";

      const html = campaignShareLandingPage({
        pageTitle,
        metaDescription: plainDesc,
        ogTitle: pageTitle,
        ogDescription: plainDesc,
        ogImage,
        canonicalUrl,
        webCampaignUrl,
        campaignTitle: row.title,
        brandIconUrl,
        appleUrl,
        playUrl,
      });
      return reply.type("text/html").send(html);
    } catch (e) {
      app.log.error(e);
      return reply.type("text/html").send(notFoundPage());
    }
  });

  app.get("/c/:campaignId/web", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const proto = (request.headers["x-forwarded-proto"] as string) || request.protocol || "https";
    const host = (request.headers["x-forwarded-host"] as string) || request.hostname;
    const baseUrl = `${proto}://${host}`;

    try {
      const campRes = await db.query(
        `SELECT c.id, c.title, c.description, c.main_image_url, c.organization_id, o.name AS org_name
         FROM campaigns c
         JOIN organizations o ON o.id = c.organization_id
         WHERE c.id = $1
         LIMIT 1`,
        [campaignId]
      );
      if (!campRes.rows.length) {
        return reply.type("text/html").send(notFoundPage());
      }
      const row = campRes.rows[0] as {
        id: string;
        title: string;
        description: string | null;
        main_image_url: string | null;
        organization_id: string;
        org_name: string;
      };
      return reply.type("text/html").send(
        webDonatePage({
          baseUrl,
          campaignId,
          orgId: row.organization_id,
          title: row.title,
          description: row.description || `Support ${row.org_name} on Give Black.`,
          orgName: row.org_name,
        })
      );
    } catch (e) {
      app.log.error(e);
      return reply.type("text/html").send(notFoundPage());
    }
  });

  app.post("/api/payments/public-donate-checkout", async (request, reply) => {
    const body = publicDonateSchema.parse(request.body);
    const stripe = getStripe();
    if (!stripe) {
      return reply.code(503).send({ error: "Payments not configured" });
    }

    const campRes = await db.query(
      `SELECT c.title, c.organization_id, o.name as org_name
       FROM campaigns c JOIN organizations o ON c.organization_id = o.id
       WHERE c.id = $1 AND c.status = 'active'`,
      [body.campaignId]
    );
    if (!campRes.rows.length) {
      return reply.code(404).send({ error: "Campaign not found or inactive" });
    }
    const camp = campRes.rows[0] as any;
    if (camp.organization_id !== body.orgId) {
      return reply.code(400).send({ error: "Campaign does not belong to this organization" });
    }
    const orgName = camp.org_name;
    const campTitle = camp.title;

    const description = `Donation to ${orgName} - ${campTitle}`;

    const proto = request.headers["x-forwarded-proto"] || request.protocol || "https";
    const host = request.headers["x-forwarded-host"] || request.hostname;
    const baseUrl = `${proto}://${host}`;
    /** Stripe must redirect to a path nginx proxies to Node (e.g. /app/*); bare /c/* hits the static site. */
    const publicBase = env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || baseUrl;

    const successUrl = `${publicBase}/c/${encodeURIComponent(body.campaignId)}/thank-you?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${publicBase}/c/${encodeURIComponent(body.campaignId)}?cancelled=1`;

    const donorUserId = body.isAnonymous ? null : await optionalDonorUserId(app, request);
    if (donorUserId && body.donorEmail) {
      const row = await db.query("select lower(trim(email)) as e from users where id = $1", [donorUserId]);
      const accountEmail = (row.rows[0] as { e?: string } | undefined)?.e;
      if (accountEmail && body.donorEmail.toLowerCase() !== accountEmail) {
        return reply.code(400).send({ error: "Donor email must match your account email" });
      }
    }

    let resolvedEmail = body.isAnonymous ? null : body.donorEmail || null;
    let resolvedName = body.isAnonymous ? null : body.donorName || null;
    if (!body.isAnonymous && donorUserId) {
      const ures = await db.query("select email, full_name from users where id = $1", [donorUserId]);
      const u = ures.rows[0] as { email?: string; full_name?: string } | undefined;
      if (u?.email && !resolvedEmail) resolvedEmail = u.email;
      if (u?.full_name && !resolvedName) resolvedName = u.full_name;
    }

    if (!body.isAnonymous && !resolvedEmail) {
      return reply.code(400).send({ error: "Email is required unless donating anonymously" });
    }

    const sessionParams: Record<string, unknown> = {
      mode: "payment" as const,
      line_items: [
        {
          price_data: {
            currency: body.currency,
            unit_amount: Math.round(body.amount * 100),
            product_data: { name: description },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        metadata: {
          orgId: body.orgId,
          campaignId: body.campaignId,
          type: "donation",
          isAnonymous: body.isAnonymous ? "true" : "false",
          donorName: body.isAnonymous ? "Anonymous" : (resolvedName || ""),
          donorEmail: resolvedEmail || "",
          source: "campaign_page",
          ...(donorUserId ? { donorUserId } : {}),
        },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        orgId: body.orgId,
        campaignId: body.campaignId,
        source: "campaign_page",
        ...(donorUserId ? { donorUserId } : {}),
      },
    };

    if (!body.isAnonymous && resolvedEmail) {
      (sessionParams as { customer_email?: string }).customer_email = resolvedEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams as any);

    /** Prefer Payment Intent id so `payment_intent.succeeded` matches this row immediately (session id alone relies on `checkout.session.completed`). */
    const donationStripeKey = stripeId(session.payment_intent) ?? session.id;

    const campPiId = stripeId(session.payment_intent);
    if (campPiId) {
      const piMeta: Record<string, string> = {
        orgId: body.orgId,
        campaignId: body.campaignId,
        type: "donation",
        isAnonymous: body.isAnonymous ? "true" : "false",
        donorName: body.isAnonymous ? "Anonymous" : (resolvedName || ""),
        donorEmail: resolvedEmail || "",
        source: "campaign_page",
        checkoutSessionId: session.id,
      };
      if (donorUserId) piMeta.donorUserId = donorUserId;
      await stripe.paymentIntents.update(campPiId, { metadata: piMeta });
    }

    await db.query(
      `INSERT INTO donations (
         org_id, campaign_id, user_id, amount, currency, status, stripe_payment_intent_id,
         donor_name, donor_email, message, is_anonymous
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        body.orgId,
        body.campaignId,
        donorUserId,
        body.amount,
        body.currency,
        "pending",
        donationStripeKey,
        body.isAnonymous ? "Anonymous" : (resolvedName || null),
        body.isAnonymous ? null : resolvedEmail,
        body.message || null,
        body.isAnonymous,
      ]
    );

    return { url: session.url, sessionId: session.id };
  });
};

const DEFAULT_CAMPAIGN_OG_PATH = "/admin/giveblack-og.png";

function stripHtmlForMeta(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function resolveCampaignOgImage(
  mainImageUrl: string | null | undefined,
  publicBase: string,
  fallbackAbsolute: string
): string {
  if (!mainImageUrl || !String(mainImageUrl).trim()) return fallbackAbsolute;
  const u = String(mainImageUrl).trim();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  const base = publicBase.replace(/\/$/, "");
  return `${base}${u.startsWith("/") ? u : `/${u}`}`;
}

function campaignShareLandingPage(opts: {
  pageTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  canonicalUrl: string;
  webCampaignUrl: string;
  campaignTitle: string;
  brandIconUrl: string;
  appleUrl: string;
  playUrl: string;
}): string {
  const t = escHtml(opts.pageTitle);
  const d = escHtml(opts.metaDescription);
  const ogT = escHtml(opts.ogTitle);
  const ogD = escHtml(opts.ogDescription);
  const img = escHtml(opts.ogImage);
  const canon = escHtml(opts.canonicalUrl);
  const web = escHtml(opts.webCampaignUrl);
  const cTitle = escHtml(opts.campaignTitle);
  const iconHref = escHtml(opts.brandIconUrl);
  const appleJs = JSON.stringify(opts.appleUrl);
  const playJs = JSON.stringify(opts.playUrl);
  const appleHref = escHtml(opts.appleUrl);
  const playHref = escHtml(opts.playUrl);
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${t}</title>
<meta name="description" content="${d}"/>
<link rel="canonical" href="${canon}"/>
<link rel="icon" type="image/png" href="${iconHref}"/>
<link rel="apple-touch-icon" href="${iconHref}"/>
<meta property="og:title" content="${ogT}"/>
<meta property="og:description" content="${ogD}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${canon}"/>
<meta property="og:image" content="${img}"/>
<meta property="og:image:alt" content="${ogT}"/>
<meta property="og:site_name" content="Give Black"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${ogT}"/>
<meta name="twitter:description" content="${ogD}"/>
<meta name="twitter:image" content="${img}"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:system-ui,-apple-system,sans-serif;background:#fafafa;color:#111;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;}
.brand{color:#059669;font-weight:800;font-size:18px;margin-bottom:16px;}
h1{font-size:22px;font-weight:700;margin-bottom:12px;line-height:1.25;max-width:420px;}
p{color:#6b7280;font-size:15px;margin-bottom:24px;max-width:400px;line-height:1.45;}
a.btn{display:inline-block;padding:14px 28px;background:#059669;color:#fff;border-radius:12px;font-weight:700;text-decoration:none;font-size:16px;}
a.btn:hover{background:#047857;}
</style>
<script>
(function(){
  var ua=navigator.userAgent;
  var isIOS=/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  var isAndroid=/Android/i.test(ua);
  if(isIOS){window.location.replace(${appleJs});}
  else if(isAndroid){window.location.replace(${playJs});}
})();
</script>
</head><body>
<div class="brand">Give Black</div>
<h1>${cTitle}</h1>
<p>${d}</p>
<p><a class="btn" href="${web}">View campaign &amp; donate</a></p>
<p style="margin-top:-8px;font-size:13px;color:#6b7280;">
  Prefer the app? <a href="${appleHref}" rel="noopener" style="color:#059669;text-decoration:none;">iOS</a> ·
  <a href="${playHref}" rel="noopener" style="color:#059669;text-decoration:none;">Android</a>
</p>
</body></html>`;
}

function deepLinkLandingPage(opts: {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  canonicalUrl: string;
  deepLink: string;
  webFallback: string;
  appleUrl: string;
  playUrl: string;
}): string {
  const title = escHtml(opts.title);
  const desc = escHtml(opts.description);
  const ogT = escHtml(opts.ogTitle);
  const ogD = escHtml(opts.ogDescription);
  const img = escHtml(opts.ogImage);
  const canon = escHtml(opts.canonicalUrl);
  const deep = escHtml(opts.deepLink);
  const web = escHtml(opts.webFallback);
  const apple = escHtml(opts.appleUrl);
  const play = escHtml(opts.playUrl);
  const appleJs = JSON.stringify(opts.appleUrl);
  const playJs = JSON.stringify(opts.playUrl);
  const deepJs = JSON.stringify(opts.deepLink);

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<meta name="description" content="${desc}"/>
<link rel="canonical" href="${canon}"/>
<meta property="og:title" content="${ogT}"/>
<meta property="og:description" content="${ogD}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${canon}"/>
<meta property="og:image" content="${img}"/>
<meta property="og:image:alt" content="${ogT}"/>
<meta property="og:site_name" content="Give Black"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${ogT}"/>
<meta name="twitter:description" content="${ogD}"/>
<meta name="twitter:image" content="${img}"/>
<style>${baseStyles()}
.center{display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;}
.center h1{font-size:22px;margin-bottom:10px;}
.center p{color:#6b7280;margin-bottom:18px;line-height:1.45;max-width:420px;}
.row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:10px;}
.btn-link{display:inline-block;padding:12px 18px;border-radius:12px;font-weight:700;text-decoration:none;font-size:15px;}
.btn-app{background:#059669;color:#fff;}
.btn-app:hover{background:#047857;}
.btn-store{background:#111;color:#fff;}
.btn-store:hover{opacity:0.92;}
.btn-web{background:#fff;border:1px solid #e5e7eb;color:#111;}
.btn-web:hover{background:#f3f4f6;}
.hint{font-size:12px;color:#9ca3af;margin-top:10px;}
</style>
<script>
(function(){
  // Try opening the app first.
  var started = Date.now();
  function goStore(){
    var ua=navigator.userAgent;
    var isIOS=/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
    var isAndroid=/Android/i.test(ua);
    if(isIOS){window.location.replace(${appleJs});}
    else if(isAndroid){window.location.replace(${playJs});}
  }
  // Attempt deep link; if app is installed, OS will open it and page will background.
  window.location.href = ${deepJs};
  // If we’re still here after ~1.2s, assume app not installed → store.
  setTimeout(function(){
    // If the page was backgrounded, skip store redirect.
    if(document.hidden) return;
    // Some browsers keep focus; also avoid immediate redirect loops.
    if(Date.now() - started < 800) return;
    goStore();
  }, 1200);
})();
</script>
</head><body>
<div class="center">
  <div>
    <div class="brand">Give Black</div>
    <h1>${title}</h1>
    <p>${desc}</p>
    <div class="row">
      <a class="btn-link btn-app" href="${deep}">Open in app</a>
      <a class="btn-link btn-web" href="${web}">Continue on web</a>
    </div>
    <div class="hint">If the app doesn’t open, we’ll send you to the store.</div>
    <div class="row" style="margin-top:12px;">
      <a class="btn-link btn-store" href="${apple}">iOS</a>
      <a class="btn-link btn-store" href="${play}">Android</a>
    </div>
  </div>
</div>
</body></html>`;
}

function webDonatePage(opts: {
  baseUrl: string;
  campaignId: string;
  orgId: string;
  title: string;
  description: string;
  orgName: string;
}): string {
  const title = escHtml(opts.title);
  const desc = escHtml(stripHtmlForMeta(opts.description).slice(0, 400));
  const orgName = escHtml(opts.orgName);
  const campaignId = escHtml(opts.campaignId);
  const orgId = escHtml(opts.orgId);
  const apiCheckout = `${opts.baseUrl.replace(/\/$/, "")}/api/payments/public-donate-checkout`;

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Donate to ${title} | GiveBlack</title>
<style>${baseStyles()}
.page{max-width:720px;margin:0 auto;padding:24px 16px 48px;}
.hero{background:#fff;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.08);padding:18px 18px 16px;margin-bottom:16px;}
.hero h1{font-size:22px;margin:0 0 6px 0;}
.hero p{margin:0;color:#6b7280;line-height:1.45;}
.grid{display:grid;grid-template-columns:1fr;gap:12px;}
@media (min-width:720px){.grid{grid-template-columns:1fr 1fr;}}
.field{display:flex;flex-direction:column;gap:6px;}
.label{font-size:12px;color:#6b7280;}
.input{width:100%;border:1px solid #e5e7eb;border-radius:12px;padding:12px 12px;font-size:15px;font-family:inherit;}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
.note{font-size:12px;color:#6b7280;line-height:1.45;}
.actions{margin-top:14px;}
.err{color:#dc2626;font-size:13px;margin-top:10px;min-height:18px;}
</style>
</head><body>
<div class="top-bar"><div class="logo">GiveBlack</div></div>
<div class="page">
  <div class="hero">
    <h1>${title}</h1>
    <p>${desc}</p>
    <p class="note" style="margin-top:10px;">Beneficiary: <strong>${orgName}</strong></p>
  </div>

  <form id="donateForm" class="card" style="padding:16px;">
    <div class="grid">
      <div class="field">
        <div class="label">Donation amount (USD)</div>
        <input class="input" name="amount" type="number" min="1" step="1" value="25" required />
      </div>
      <div class="field">
        <div class="label">Email (required unless anonymous)</div>
        <input class="input" name="donorEmail" type="email" placeholder="you@example.com" />
      </div>
      <div class="field">
        <div class="label">Name (optional)</div>
        <input class="input" name="donorName" type="text" placeholder="Your name" />
      </div>
      <div class="field">
        <div class="label">Message (optional)</div>
        <input class="input" name="message" type="text" placeholder="Leave a note" />
      </div>
    </div>
    <div class="row" style="margin-top:12px;">
      <label class="note"><input type="checkbox" name="isAnonymous" /> Donate anonymously</label>
    </div>
    <div class="actions">
      <button class="btn-primary" id="submitBtn" type="submit">Continue to secure checkout</button>
      <div class="err" id="err"></div>
      <p class="note" style="margin-top:10px;">Payments are processed securely by Stripe.</p>
    </div>
    <input type="hidden" name="campaignId" value="${campaignId}" />
    <input type="hidden" name="orgId" value="${orgId}" />
  </form>
</div>
<script>
(function(){
  var form=document.getElementById('donateForm');
  var btn=document.getElementById('submitBtn');
  var err=document.getElementById('err');
  function setError(msg){ err.textContent = msg || ''; }
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    setError('');
    btn.disabled = true;
    btn.textContent = 'Starting checkout…';
    try{
      var fd=new FormData(form);
      var payload={
        campaignId: fd.get('campaignId'),
        orgId: fd.get('orgId'),
        amount: Number(fd.get('amount') || 0),
        currency: 'usd',
        donorEmail: (fd.get('donorEmail') || '').toString().trim() || undefined,
        donorName: (fd.get('donorName') || '').toString().trim() || undefined,
        message: (fd.get('message') || '').toString().trim() || undefined,
        isAnonymous: !!fd.get('isAnonymous'),
      };
      var res = await fetch(${JSON.stringify(apiCheckout)}, {
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify(payload),
      });
      var data = await res.json().catch(function(){ return {}; });
      if(!res.ok){
        setError((data && data.error) ? data.error : 'Checkout failed');
        btn.disabled = false;
        btn.textContent = 'Continue to secure checkout';
        return;
      }
      if(data && data.url){
        window.location.href = data.url;
        return;
      }
      setError('Checkout failed: missing redirect URL');
      btn.disabled = false;
      btn.textContent = 'Continue to secure checkout';
    }catch(ex){
      setError('Network error. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Continue to secure checkout';
    }
  });
})();
</script>
</body></html>`;
}

function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Campaign Not Found | GiveBlack</title>
<style>${baseStyles()}
.center{display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;}
.center h1{font-size:24px;margin-bottom:8px;}
.center p{color:#6b7280;margin-bottom:24px;}
</style>
</head><body>
<div class="center">
  <div>
    <h1>Campaign Not Found</h1>
    <p>This campaign may have ended or the link is incorrect.</p>
    <a href="https://giveblackapp.com/" class="btn-primary" style="display:inline-block;text-decoration:none;">Go Home</a>
  </div>
</div>
</body></html>`;
}


function thankYouPage(
  camp: any,
  amount: number,
  currency: string,
  donorName: string,
  isAnonymous: boolean,
  reference: string,
  donationId: string,
  baseUrl: string,
  campaignId: string,
  donorEmailHint: string | null,
  appleUrl: string,
  playUrl: string,
  loginUrl: string
) {
  const amtStr = amount.toLocaleString("en-US", { style: "currency", currency: currency.toUpperCase() });
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const receiptUrl = donationId ? `/c/receipt-pdf?donationId=${encodeURIComponent(donationId)}` : "";
  const receiptAbs = receiptUrl ? `${baseUrl.replace(/\/$/, "")}${receiptUrl}` : "";
  const accountBlock =
    !isAnonymous && donorEmailHint
      ? `<div class="account-hint">
      <h3>Track your impact</h3>
      <p>Sign in to the GiveBlack app with <strong>${escHtml(donorEmailHint)}</strong> to see this donation, your ranking, and more campaigns.</p>
      <p class="claim-note">If you create a new account with that email, use <strong>Profile → Link donation</strong> in the app and paste your checkout session ID if needed.</p>
      <a href="${escHtml(loginUrl)}" class="btn-secondary" target="_blank" rel="noopener">Open GiveBlack</a>
    </div>`
      : !isAnonymous
        ? `<div class="account-hint">
      <h3>Track your impact</h3>
      <p><a href="${escHtml(loginUrl)}" target="_blank" rel="noopener">Open GiveBlack</a> and sign in with the same email you used in Stripe to see your donation history.</p>
    </div>`
        : "";

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Thank You | GiveBlack</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>${baseStyles()}
${thankYouStyles()}
</style>
</head><body>

<header class="top-bar">
  <div class="logo">GiveBlack</div>
</header>

<main class="page">
  <div class="card thank-you-card">

    <div class="success-header">
      <div class="check-circle">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <h1>Thank You for Your Donation!</h1>
      <p class="subtitle">Your generosity makes a real difference</p>
    </div>

    <div class="receipt-section">
      <div class="amount-display">${amtStr}</div>

      <div class="receipt-details">
        <div class="receipt-row"><span>Donor</span><span>${isAnonymous ? "Anonymous" : escHtml(donorName)}</span></div>
        <div class="receipt-row"><span>Campaign</span><span>${escHtml(camp.title)}</span></div>
        <div class="receipt-row"><span>Organization</span><span>${escHtml(camp.org_name)}</span></div>
        <div class="receipt-row"><span>Date</span><span>${today}</span></div>
        ${reference ? `<div class="receipt-row"><span>Reference</span><span style="font-family:monospace">${reference}</span></div>` : ""}
      </div>

      ${receiptUrl ? `<div class="receipt-actions">
        <a class="btn-primary" href="${receiptUrl}" download>Download receipt (PDF)</a>
        <a class="btn-secondary-outline" href="${receiptUrl}" target="_blank" rel="noopener">Open receipt</a>
        <div class="receipt-link-wrap">
          <div class="receipt-link-label">Receipt link</div>
          <input class="receipt-link" readonly value="${escHtml(receiptAbs)}" />
          <div class="copy-hint">Tip: copy this link to share the receipt.</div>
        </div>
      </div>` : ""}
    </div>

    <div class="app-section">
      <div class="app-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
          <line x1="12" y1="18" x2="12.01" y2="18"></line>
        </svg>
      </div>
      <h2>Download GiveBlack App</h2>
      <p>Track your donations, view your impact ranking, and discover more campaigns to support.</p>

      <div class="store-buttons">
        <a href="${escHtml(appleUrl)}" target="_blank" rel="noopener" class="store-btn apple-btn">
          <svg width="20" height="24" viewBox="0 0 20 24" fill="#fff">
            <path d="M16.52 12.58c-.03-2.87 2.34-4.25 2.44-4.31-1.33-1.94-3.4-2.21-4.14-2.24-1.76-.18-3.44 1.04-4.33 1.04-.9 0-2.28-1.01-3.75-.98-1.93.03-3.71 1.12-4.71 2.85-2.01 3.49-.51 8.66 1.44 11.5.96 1.39 2.1 2.95 3.6 2.89 1.44-.06 1.99-.93 3.74-.93 1.74 0 2.24.93 3.76.9 1.56-.03 2.55-1.41 3.49-2.81 1.1-1.61 1.55-3.17 1.58-3.25-.03-.02-3.03-1.16-3.06-4.62l-.06-.04zM13.64 3.87c.8-.97 1.34-2.31 1.19-3.65-1.15.05-2.55.77-3.37 1.73-.74.85-1.38 2.22-1.21 3.53 1.29.1 2.6-.65 3.39-1.61z"/>
          </svg>
          <div><small>Download on the</small><div>App Store</div></div>
        </a>
        <a href="${escHtml(playUrl)}" target="_blank" rel="noopener" class="store-btn google-btn">
          <svg width="20" height="22" viewBox="0 0 20 22" fill="#fff">
            <path d="M1 1l10 10L1 21V1zm2.83 0L14.5 7.23 12.16 9.4 3.83 1zm0 20l8.33-8.4 2.34 2.17L3.83 21zM15.54 8.15l2.82 1.62c.8.46.8 1.6 0 2.06l-2.82 1.62-2.6-2.65 2.6-2.65z"/>
          </svg>
          <div><small>Get it on</small><div>Google Play</div></div>
        </a>
      </div>
    </div>

    ${accountBlock}

    <div class="back-link">
      <a href="/c/${encodeURIComponent(campaignId)}">← Back to Campaign</a>
    </div>
  </div>

  <footer class="page-footer">
    <div>GiveBlack: simplifying giving for Black organizations globally</div>
  </footer>
</main>

</body></html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function baseStyles() {
  return `
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Poppins',sans-serif;background:#f5f5f5;color:#111;min-height:100vh;}
.top-bar{background:#111;padding:16px 24px;display:flex;align-items:center;}
.logo{color:#059669;font-weight:800;font-size:20px;letter-spacing:0.5px;}
.page{max-width:520px;margin:0 auto;padding:24px 16px 40px;}
.card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);}
.btn-primary{display:block;width:100%;padding:16px;background:#059669;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;transition:background 0.2s;}
.btn-primary:hover{background:#047857;}
.btn-primary:disabled{background:#9ca3af;cursor:not-allowed;}
.page-footer{text-align:center;padding:24px 0 0;font-size:12px;color:#9ca3af;}
.error-msg{color:#dc2626;font-size:13px;margin-top:8px;text-align:center;min-height:18px;}
`;
}


function thankYouStyles() {
  return `
.thank-you-card{padding:0;}
.success-header{background:linear-gradient(135deg,#059669,#047857);padding:40px 24px;text-align:center;color:#fff;}
.check-circle{width:64px;height:64px;background:rgba(255,255,255,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;}
.success-header h1{font-size:22px;font-weight:700;margin-bottom:6px;}
.subtitle{opacity:0.85;font-size:14px;}
.receipt-section{padding:24px;}
.amount-display{text-align:center;font-size:36px;font-weight:800;color:#059669;margin-bottom:20px;}
.receipt-details{background:#f9fafb;border-radius:10px;padding:16px;border:1px solid #f3f4f6;}
.receipt-row{display:flex;justify-content:space-between;padding:10px 0;font-size:13px;border-bottom:1px solid #f3f4f6;}
.receipt-row:last-child{border-bottom:none;}
.receipt-row span:first-child{color:#6b7280;}
.receipt-row span:last-child{font-weight:600;color:#111;}
.receipt-actions{display:flex;flex-direction:column;gap:10px;margin-top:16px;}
.btn-secondary-outline{display:block;width:100%;padding:14px 16px;background:#fff;color:#111;border:1px solid #e5e7eb;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;transition:background 0.2s;}
.btn-secondary-outline:hover{background:#f9fafb;}
.copy-hint{min-height:18px;font-size:12px;color:#6b7280;text-align:center;}
.receipt-link-wrap{border:1px solid #e5e7eb;border-radius:12px;padding:12px;background:#fff;}
.receipt-link-label{font-size:12px;color:#6b7280;margin-bottom:6px;font-weight:600;}
.receipt-link{width:100%;padding:10px 12px;border-radius:10px;border:1px solid #f3f4f6;background:#f9fafb;color:#111;font-size:12px;outline:none;}
.app-section{padding:0 24px 24px;text-align:center;}
.app-icon{width:56px;height:56px;background:#f0fdf4;border-radius:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;}
.app-section h2{font-size:18px;font-weight:700;margin-bottom:6px;}
.app-section p{font-size:13px;color:#6b7280;margin-bottom:16px;line-height:1.5;}
.store-buttons{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}
.store-btn{display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:10px;text-decoration:none;color:#fff;font-size:13px;transition:opacity 0.2s;}
.store-btn:hover{opacity:0.9;}
.store-btn small{font-size:10px;opacity:0.8;display:block;line-height:1;}
.store-btn div div{font-weight:600;font-size:14px;line-height:1.2;}
.apple-btn{background:#111;}
.google-btn{background:#111;}
.back-link{text-align:center;padding:16px 24px 24px;}
.back-link a{color:#059669;font-size:14px;font-weight:500;text-decoration:none;}
.back-link a:hover{text-decoration:underline;}
.account-hint{padding:0 24px 20px;text-align:left;}
.account-hint h3{font-size:16px;font-weight:700;margin-bottom:8px;color:#111;}
.account-hint p{font-size:13px;color:#6b7280;line-height:1.5;margin-bottom:10px;}
.claim-note{font-size:12px!important;color:#9ca3af!important;}
.btn-secondary{display:inline-block;margin-top:8px;padding:10px 18px;background:#fff;color:#059669;border:2px solid #059669;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;}
.btn-secondary:hover{background:#f0fdf4;}

/* Keep buttons tappable on narrow screens */
@media (max-width: 420px){
  .btn-primary,.btn-secondary-outline{padding:14px 14px;}
}
`;
}

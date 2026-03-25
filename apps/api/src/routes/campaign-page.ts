import type { FastifyPluginAsync } from "fastify";
import { db } from "../lib/db.js";
import { env } from "../config/env.js";
import { getStripe } from "../services/stripe.js";
import { z } from "zod";

const publicDonateSchema = z.object({
  campaignId: z.string().min(1),
  orgId: z.string().min(1),
  amount: z.coerce.number().positive(),
  currency: z.string().default("usd"),
  donorName: z.string().optional(),
  donorEmail: z.string().email().optional(),
  isAnonymous: z.boolean().default(false),
});

export const campaignPageRoutes: FastifyPluginAsync = async (app) => {

  app.get("/c/:campaignId", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };

    const res = await db.query(
      `SELECT c.id, c.title, c.description, c.story, c.goal, c.raised, c.donor_count, c.main_image_url,
              o.name as org_name, o.id as org_id
       FROM campaigns c
       JOIN organizations o ON c.organization_id = o.id
       WHERE c.id = $1 AND c.status = 'active'`,
      [campaignId]
    );

    if (!res.rows.length) {
      return reply.code(404).type("text/html").send(notFoundPage());
    }

    const camp = res.rows[0] as any;
    const pct = camp.goal > 0 ? Math.min(100, Math.round((Number(camp.raised) / Number(camp.goal)) * 100)) : 0;

    return reply.type("text/html").send(campaignPage(camp, pct));
  });

  app.get("/c/:campaignId/thank-you", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const q = request.query as { session_id?: string };

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

    if (q.session_id) {
      try {
        const stripe = getStripe();
        if (stripe) {
          const session = await stripe.checkout.sessions.retrieve(q.session_id);
          amount = typeof session.amount_total === "number" ? session.amount_total / 100 : 0;
          currency = session.currency || "usd";

          const piId = session.payment_intent as string | null;
          if (piId) {
            const donRes = await db.query(
              `SELECT donor_name, is_anonymous, id, campaign_id FROM donations WHERE stripe_payment_intent_id = $1 LIMIT 1`,
              [piId]
            );
            if (donRes.rows.length) {
              const d = donRes.rows[0] as any;
              if (d.campaign_id === campaignId) {
                donorName = d.is_anonymous ? "Anonymous" : (d.donor_name || "Donor");
                isAnonymous = d.is_anonymous;
                reference = String(d.id).substring(0, 8).toUpperCase();
              }
            }
          }
        }
      } catch {}
    }

    return reply.type("text/html").send(thankYouPage(camp, amount, currency, donorName, isAnonymous, reference, campaignId));
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

    const successUrl = `${baseUrl}/c/${encodeURIComponent(body.campaignId)}/thank-you?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/c/${encodeURIComponent(body.campaignId)}?cancelled=1`;

    const sessionParams: any = {
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
          donorName: body.isAnonymous ? "Anonymous" : (body.donorName || ""),
          donorEmail: body.donorEmail || "",
          source: "campaign_page",
        },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        orgId: body.orgId,
        campaignId: body.campaignId,
        source: "campaign_page",
      },
    };

    if (!body.isAnonymous && body.donorEmail) {
      sessionParams.customer_email = body.donorEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    await db.query(
      `INSERT INTO donations (org_id, campaign_id, amount, currency, status, stripe_payment_intent_id, donor_name, donor_email, is_anonymous)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        body.orgId,
        body.campaignId,
        body.amount,
        body.currency,
        "pending",
        session.id,
        body.isAnonymous ? "Anonymous" : (body.donorName || null),
        body.isAnonymous ? null : (body.donorEmail || null),
        body.isAnonymous,
      ]
    );

    return { url: session.url, sessionId: session.id };
  });
};

function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Campaign Not Found — GiveBlack</title>
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
    <a href="/" class="btn-primary" style="display:inline-block;text-decoration:none;">Go Home</a>
  </div>
</div>
</body></html>`;
}

function campaignPage(camp: any, pct: number) {
  const raised = Number(camp.raised).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
  const goal = Number(camp.goal).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escHtml(camp.title)} — GiveBlack</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>${baseStyles()}
${campaignStyles()}
</style>
</head><body>

<header class="top-bar">
  <div class="logo">GiveBlack</div>
</header>

<main class="page">
  <div class="card">
    <div class="campaign-hero">
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <div class="org-badge">${escHtml(camp.org_name)}</div>
        <h1>${escHtml(camp.title)}</h1>
      </div>
    </div>

    <div class="campaign-body">
      <p class="description">${escHtml(camp.description || "")}</p>

      <div class="progress-section">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-stats">
          <div><span class="stat-value">${raised}</span><span class="stat-label">raised</span></div>
          <div style="text-align:center"><span class="stat-value">${camp.donor_count}</span><span class="stat-label">donors</span></div>
          <div style="text-align:right"><span class="stat-value">${goal}</span><span class="stat-label">goal</span></div>
        </div>
      </div>

      <div class="donate-section" id="donate-section">
        <h2>Make a Donation</h2>

        <div class="amount-grid">
          <button class="amount-btn" data-amount="10">$10</button>
          <button class="amount-btn" data-amount="25">$25</button>
          <button class="amount-btn selected" data-amount="50">$50</button>
          <button class="amount-btn" data-amount="100">$100</button>
          <button class="amount-btn" data-amount="250">$250</button>
          <button class="amount-btn" data-amount="500">$500</button>
        </div>
        <div class="custom-row">
          <span class="dollar-sign">$</span>
          <input type="number" id="custom-amount" placeholder="Custom amount" min="1" step="1"/>
        </div>

        <div class="toggle-row" id="anon-toggle-row">
          <label class="toggle-label">
            <span>Donate Anonymously</span>
            <input type="checkbox" id="anon-toggle"/>
            <span class="toggle-switch"></span>
          </label>
        </div>

        <div id="donor-fields">
          <div class="field-group">
            <label>Full Name</label>
            <input type="text" id="donor-name" placeholder="Your full name" autocomplete="name"/>
          </div>
          <div class="field-group">
            <label>Email</label>
            <input type="email" id="donor-email" placeholder="your@email.com" autocomplete="email"/>
          </div>
        </div>

        <div class="fee-breakdown" id="fee-breakdown">
          <div class="fee-row"><span>Donation to ${escHtml(camp.org_name)}</span><span id="fee-org">$48.50</span></div>
          <div class="fee-row"><span>Platform Fee (3%)</span><span id="fee-platform">$1.50</span></div>
          <div class="fee-row total"><span>Total</span><span id="fee-total">$50.00</span></div>
        </div>

        <button class="btn-primary" id="donate-btn" onclick="handleDonate()">
          Donate Now
        </button>
        <div id="error-msg" class="error-msg"></div>
      </div>
    </div>
  </div>

  <footer class="page-footer">
    <div>GiveBlack — Simplifying giving for Black organizations globally</div>
  </footer>
</main>

<script>
  const CAMPAIGN_ID = ${JSON.stringify(camp.id)};
  const ORG_ID = ${JSON.stringify(camp.org_id)};
  let selectedAmount = 50;

  document.querySelectorAll('.amount-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedAmount = Number(btn.dataset.amount);
      document.getElementById('custom-amount').value = '';
      updateFees();
    });
  });

  document.getElementById('custom-amount').addEventListener('input', (e) => {
    const val = Number(e.target.value);
    if (val > 0) {
      document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
      selectedAmount = val;
      updateFees();
    }
  });

  document.getElementById('anon-toggle').addEventListener('change', (e) => {
    const fields = document.getElementById('donor-fields');
    fields.style.display = e.target.checked ? 'none' : 'block';
  });

  function updateFees() {
    const platformFee = selectedAmount * 0.03;
    const orgAmount = selectedAmount - platformFee;
    document.getElementById('fee-org').textContent = '$' + orgAmount.toFixed(2);
    document.getElementById('fee-platform').textContent = '$' + platformFee.toFixed(2);
    document.getElementById('fee-total').textContent = '$' + selectedAmount.toFixed(2);
  }
  updateFees();

  async function handleDonate() {
    const btn = document.getElementById('donate-btn');
    const errEl = document.getElementById('error-msg');
    errEl.textContent = '';

    if (selectedAmount < 1) {
      errEl.textContent = 'Please enter a valid amount.';
      return;
    }

    const isAnonymous = document.getElementById('anon-toggle').checked;
    const donorName = document.getElementById('donor-name').value.trim();
    const donorEmail = document.getElementById('donor-email').value.trim();

    if (!isAnonymous && !donorEmail) {
      errEl.textContent = 'Please enter your email or donate anonymously.';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
      const res = await fetch('/api/payments/public-donate-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: CAMPAIGN_ID,
          orgId: ORG_ID,
          amount: selectedAmount,
          currency: 'usd',
          donorName: isAnonymous ? '' : donorName,
          donorEmail: isAnonymous ? '' : donorEmail,
          isAnonymous,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Could not create checkout session');
      }
    } catch (e) {
      errEl.textContent = e.message || 'Something went wrong. Please try again.';
      btn.disabled = false;
      btn.textContent = 'Donate Now';
    }
  }
</script>
</body></html>`;
}

function thankYouPage(camp: any, amount: number, currency: string, donorName: string, isAnonymous: boolean, reference: string, campaignId: string) {
  const amtStr = amount.toLocaleString("en-US", { style: "currency", currency: currency.toUpperCase() });
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Thank You — GiveBlack</title>
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
        <a href="https://apps.apple.com/app/giveblack" target="_blank" class="store-btn apple-btn">
          <svg width="20" height="24" viewBox="0 0 20 24" fill="#fff">
            <path d="M16.52 12.58c-.03-2.87 2.34-4.25 2.44-4.31-1.33-1.94-3.4-2.21-4.14-2.24-1.76-.18-3.44 1.04-4.33 1.04-.9 0-2.28-1.01-3.75-.98-1.93.03-3.71 1.12-4.71 2.85-2.01 3.49-.51 8.66 1.44 11.5.96 1.39 2.1 2.95 3.6 2.89 1.44-.06 1.99-.93 3.74-.93 1.74 0 2.24.93 3.76.9 1.56-.03 2.55-1.41 3.49-2.81 1.1-1.61 1.55-3.17 1.58-3.25-.03-.02-3.03-1.16-3.06-4.62l-.06-.04zM13.64 3.87c.8-.97 1.34-2.31 1.19-3.65-1.15.05-2.55.77-3.37 1.73-.74.85-1.38 2.22-1.21 3.53 1.29.1 2.6-.65 3.39-1.61z"/>
          </svg>
          <div><small>Download on the</small><div>App Store</div></div>
        </a>
        <a href="https://play.google.com/store/apps/details?id=com.giveblack" target="_blank" class="store-btn google-btn">
          <svg width="20" height="22" viewBox="0 0 20 22" fill="#fff">
            <path d="M1 1l10 10L1 21V1zm2.83 0L14.5 7.23 12.16 9.4 3.83 1zm0 20l8.33-8.4 2.34 2.17L3.83 21zM15.54 8.15l2.82 1.62c.8.46.8 1.6 0 2.06l-2.82 1.62-2.6-2.65 2.6-2.65z"/>
          </svg>
          <div><small>Get it on</small><div>Google Play</div></div>
        </a>
      </div>
    </div>

    <div class="back-link">
      <a href="/c/${encodeURIComponent(campaignId)}">← Back to Campaign</a>
    </div>
  </div>

  <footer class="page-footer">
    <div>GiveBlack — Simplifying giving for Black organizations globally</div>
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

function campaignStyles() {
  return `
.campaign-hero{position:relative;height:200px;background:linear-gradient(135deg,#059669,#047857);overflow:hidden;}
.hero-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.5));}
.hero-content{position:absolute;bottom:0;left:0;right:0;padding:20px 24px;color:#fff;z-index:1;}
.org-badge{display:inline-block;background:rgba(255,255,255,0.2);backdrop-filter:blur(8px);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:500;margin-bottom:8px;}
.hero-content h1{font-size:22px;font-weight:700;line-height:1.3;}
.campaign-body{padding:24px;}
.description{color:#4b5563;font-size:14px;line-height:1.6;margin-bottom:20px;}
.progress-section{margin-bottom:28px;}
.progress-bar{height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;margin-bottom:10px;}
.progress-fill{height:100%;background:linear-gradient(90deg,#059669,#10b981);border-radius:4px;transition:width 0.6s;}
.progress-stats{display:flex;justify-content:space-between;}
.stat-value{display:block;font-weight:700;font-size:16px;color:#111;}
.stat-label{display:block;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;}
.donate-section h2{font-size:18px;font-weight:700;margin-bottom:16px;}
.amount-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;}
.amount-btn{padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:#fff;font-size:16px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:inherit;}
.amount-btn:hover{border-color:#059669;color:#059669;}
.amount-btn.selected{border-color:#059669;background:#f0fdf4;color:#059669;}
.custom-row{display:flex;align-items:center;border:2px solid #e5e7eb;border-radius:10px;padding:0 12px;margin-bottom:16px;}
.dollar-sign{font-size:16px;font-weight:600;color:#6b7280;margin-right:4px;}
.custom-row input{flex:1;border:none;outline:none;padding:12px 0;font-size:16px;font-family:inherit;background:transparent;}
.toggle-row{margin-bottom:16px;}
.toggle-label{display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-size:14px;font-weight:500;}
.toggle-label input{display:none;}
.toggle-switch{width:44px;height:24px;background:#d1d5db;border-radius:12px;position:relative;transition:background 0.2s;flex-shrink:0;}
.toggle-switch::after{content:'';position:absolute;top:2px;left:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2);}
.toggle-label input:checked + .toggle-switch{background:#059669;}
.toggle-label input:checked + .toggle-switch::after{transform:translateX(20px);}
#donor-fields{margin-bottom:16px;}
.field-group{margin-bottom:12px;}
.field-group label{display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;}
.field-group input{width:100%;padding:12px;border:2px solid #e5e7eb;border-radius:10px;font-size:15px;font-family:inherit;outline:none;transition:border-color 0.2s;}
.field-group input:focus{border-color:#059669;}
.fee-breakdown{background:#f9fafb;border-radius:10px;padding:14px 16px;margin-bottom:20px;border:1px solid #f3f4f6;}
.fee-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#6b7280;}
.fee-row.total{border-top:2px solid #059669;margin-top:6px;padding-top:10px;font-size:15px;font-weight:700;color:#111;}
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
`;
}

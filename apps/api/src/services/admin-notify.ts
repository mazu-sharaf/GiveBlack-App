import { db } from "../lib/db.js";
import { env } from "../config/env.js";
import { sendBrevoEmail } from "./brevo.js";
import { emailLayout, ctaButton } from "./email-template.js";

/** Base URL for links into the admin SPA (pathname includes /admin). */
export function getAdminAppBase(): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  const api = env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "").replace(/\/app\/?$/, "");
  if (api) return api;
  return "https://giveblackapp.com";
}

async function getAdminRecipientEmails(): Promise<string[]> {
  const list: string[] = [];
  if (env.ADMIN_EMAIL) list.push(env.ADMIN_EMAIL.trim());
  const rows = await db.query("select email from admin_emails order by created_at asc");
  for (const row of rows.rows as { email: string }[]) {
    const e = row?.email?.trim();
    if (e && !list.some((x) => x.toLowerCase() === e.toLowerCase())) list.push(e);
  }
  return list;
}

async function notifyAdmins(subject: string, html: string, tags: string[]): Promise<void> {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
    console.warn("[admin-notify] Brevo not configured; skipping admin email:", subject);
    return;
  }
  const emails = await getAdminRecipientEmails();
  if (emails.length === 0) {
    console.warn("[admin-notify] No admin emails configured; skipping:", subject);
    return;
  }
  const [first, ...rest] = emails;
  await sendBrevoEmail({
    to: first,
    subject,
    html: emailLayout(html),
    bcc: rest.length ? rest.map((email) => ({ email })) : undefined,
    tags,
  });
}

export async function notifyAdminsNewCharityRequest(input: {
  requestId: string;
  charityName: string;
  contactName: string;
  contactEmail: string;
}): Promise<void> {
  const base = getAdminAppBase();
  const reviewUrl = `${base}/admin/charity-requests`;
  const content = `
    <h2 style="color:#ffffff;margin:0 0 8px 0;font-size:22px;">New charity signup request</h2>
    <p style="color:#cccccc;margin:0 0 16px 0;font-size:16px;">Someone submitted an application to join GiveBlack as a charity organization.</p>
    <div style="background:#1a1a1a;border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="color:#cccccc;margin:0 0 8px 0;"><strong>Organization:</strong> ${escapeHtml(input.charityName)}</p>
      <p style="color:#cccccc;margin:0 0 8px 0;"><strong>Contact:</strong> ${escapeHtml(input.contactName)}</p>
      <p style="color:#cccccc;margin:0 0 8px 0;"><strong>Email:</strong> ${escapeHtml(input.contactEmail)}</p>
      <p style="color:#999999;margin:12px 0 0 0;font-size:14px;">Request ID: <code style="color:#cccccc;">${escapeHtml(input.requestId)}</code></p>
    </div>
    <div style="text-align:center;margin-bottom:8px;">${ctaButton(reviewUrl, "Review in admin")}</div>
  `;
  await notifyAdmins("New charity request: GiveBlack admin", content, ["giveblack", "admin-charity-request"]);
}

export async function notifyAdminsNewCampaign(input: {
  campaignId: string;
  title: string;
  orgName: string;
}): Promise<void> {
  const base = getAdminAppBase();
  const detailUrl = `${base}/admin/campaigns/${encodeURIComponent(input.campaignId)}`;
  const content = `
    <h2 style="color:#ffffff;margin:0 0 8px 0;font-size:22px;">New campaign pending review</h2>
    <p style="color:#cccccc;margin:0 0 16px 0;font-size:16px;">A charity created a campaign that needs approval before it goes live.</p>
    <div style="background:#1a1a1a;border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="color:#cccccc;margin:0 0 8px 0;"><strong>Campaign:</strong> ${escapeHtml(input.title)}</p>
      <p style="color:#cccccc;margin:0 0 8px 0;"><strong>Organization:</strong> ${escapeHtml(input.orgName)}</p>
      <p style="color:#999999;margin:12px 0 0 0;font-size:14px;">Campaign ID: <code style="color:#cccccc;">${escapeHtml(input.campaignId)}</code></p>
    </div>
    <div style="text-align:center;margin-bottom:8px;">${ctaButton(detailUrl, "Review campaign")}</div>
  `;
  await notifyAdmins("New campaign pending approval: GiveBlack admin", content, ["giveblack", "admin-campaign-pending"]);
}

/** Email volunteer when their request is approved by the organization (mobile org dashboard). */
export async function notifyVolunteerApproved(input: {
  volunteerEmail: string;
  volunteerName: string;
  orgName: string;
}): Promise<void> {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
    console.warn("[volunteer-notify] Brevo not configured; skipping volunteer approval email");
    return;
  }
  const content = `
    <h2 style="color:#ffffff;margin:0 0 8px 0;font-size:22px;">You're approved to volunteer</h2>
    <p style="color:#cccccc;margin:0 0 16px 0;font-size:16px;">
      ${escapeHtml(input.orgName)} has approved your volunteer request on GiveBlack.
    </p>
    <div style="background:#1a1a1a;border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="color:#cccccc;margin:0;">Hi ${escapeHtml(input.volunteerName || "there")},</p>
      <p style="color:#999999;margin:12px 0 0 0;font-size:14px;">
        The organization may reach out with next steps. Thank you for supporting the community.
      </p>
    </div>
  `;
  await sendBrevoEmail({
    to: input.volunteerEmail.trim(),
    subject: `${input.orgName} approved your volunteer request`,
    html: emailLayout(content),
    tags: ["giveblack", "volunteer-approved"],
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

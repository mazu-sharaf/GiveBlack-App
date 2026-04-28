#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../..");
config({ path: path.join(repoRoot, ".env") });

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "support@giveblackapp.com";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "GiveBlack";
const toEmail = process.env.ADMIN_EMAIL || "mazu@mawamedia.com";
const APP_URL = process.env.APP_URL || "https://giveblackapp.com";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "info@giveblackapp.com";
const LOGO_URL = process.env.EMAIL_LOGO_URL || "";

if (!BREVO_API_KEY) {
  console.error("BREVO_API_KEY is not set in .env");
  process.exit(1);
}

const logoBlock = LOGO_URL
  ? `<img src="${LOGO_URL}" alt="GiveBlack" width="180" height="48" style="display:block;max-width:180px;height:auto;" />`
  : `<span style="font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">GiveBlack</span>`;

const content = `
  <h2 style="color:#ffffff;margin:0 0 8px 0;font-size:22px;">Test email</h2>
  <p style="color:#cccccc;margin:0 0 16px 0;font-size:16px;">This is a test of the GiveBlack email design. All transactional emails (charity approve/reject, password reset, campaign goal reached, notifications) use this branding and contact footer.</p>
  <p style="color:#999999;font-size:14px;">Sent at ${new Date().toISOString()}</p>
`;

const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>GiveBlack</title>
</head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;">
    <tr>
      <td align="center" style="padding:32px 16px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td style="background:#0a0a0a;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg, #059669 0%, #047857 100%);padding:28px 32px;text-align:center;">
                    <a href="${APP_URL}" style="text-decoration:none;">${logoBlock}</a>
                    <p style="margin:10px 0 0 0;font-size:13px;color:rgba(255,255,255,0.9);letter-spacing:0.5px;">Empowering communities through giving</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 32px 28px;color:#ffffff;">
                    ${content}
                  </td>
                </tr>
                <tr>
                  <td style="border-top:1px solid #222;padding:24px 32px;background:#111;">
                    <p style="margin:0 0 8px 0;font-size:12px;color:#666;text-align:center;">GiveBlack — Empowering communities through giving</p>
                    <p style="margin:0;font-size:12px;color:#666;text-align:center;">
                      <a href="${APP_URL}" style="color:#059669;text-decoration:none;">${APP_URL.replace(/^https?:\/\//, "")}</a>
                      &nbsp;·&nbsp;
                      <a href="mailto:${SUPPORT_EMAIL}" style="color:#059669;text-decoration:none;">${SUPPORT_EMAIL}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

const res = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "api-key": BREVO_API_KEY,
  },
  body: JSON.stringify({
    sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
    to: [{ email: toEmail }],
    subject: "GiveBlack – Test email (branding & contact)",
    htmlContent: html,
    tags: ["giveblack", "test-admin"],
  }),
});

if (!res.ok) {
  const body = await res.text();
  console.error("Brevo send failed:", res.status, body);
  process.exit(1);
}

console.log("Test email sent to:", toEmail);

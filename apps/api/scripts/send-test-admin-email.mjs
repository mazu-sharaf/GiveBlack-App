#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../..");
config({ path: path.join(repoRoot, ".env") });

const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID?.trim();
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY?.trim();
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || "support@giveblackapp.com";
const SES_FROM_NAME = process.env.SES_FROM_NAME || "GiveBlack";
const toEmail = process.env.ADMIN_EMAIL || "mazu@mawamedia.com";
const APP_URL = process.env.APP_URL || "https://giveblackapp.com";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "info@giveblackapp.com";
const LOGO_URL = process.env.EMAIL_LOGO_URL || "";

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set in .env");
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

const from = SES_FROM_NAME ? `${SES_FROM_NAME} <${SES_FROM_EMAIL}>` : SES_FROM_EMAIL;
const client = new SESv2Client({
  region: AWS_REGION,
  credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
});

try {
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [toEmail] },
      Content: {
        Simple: {
          Subject: { Data: "GiveBlack – Test email (branding & contact)", Charset: "UTF-8" },
          Body: { Html: { Data: html, Charset: "UTF-8" } },
        },
      },
    })
  );
} catch (err) {
  console.error("SES send failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}

console.log("Test email sent to:", toEmail);

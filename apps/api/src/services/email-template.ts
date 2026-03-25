import { env } from "../config/env.js";

/** GiveBlack brand colors for email */
export const EMAIL_BRAND = {
  background: "#0a0a0a",
  surface: "#111111",
  card: "#1a1a1a",
  border: "#222222",
  primary: "#059669",
  primaryHover: "#047857",
  text: "#ffffff",
  textMuted: "#cccccc",
  textDim: "#999999",
  footer: "#666666",
} as const;

const APP_URL = env.APP_URL || "https://giveblackapp.com";
const SUPPORT_EMAIL = env.SUPPORT_EMAIL || "info@giveblackapp.com";
const LOGO_URL = env.EMAIL_LOGO_URL || "";

/**
 * GiveBlack branded email layout: logo/wordmark, content area, footer with contact details.
 * Use for all transactional emails.
 */
export function emailLayout(content: string): string {
  const logoBlock = LOGO_URL
    ? `<img src="${LOGO_URL}" alt="GiveBlack" width="180" height="48" style="display:block;max-width:180px;height:auto;" />`
    : `<span style="font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">GiveBlack</span>`;

  return `
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
            <td style="background:${EMAIL_BRAND.background};border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg, ${EMAIL_BRAND.primary} 0%, ${EMAIL_BRAND.primaryHover} 100%);padding:28px 32px;text-align:center;">
                    <a href="${APP_URL}" style="text-decoration:none;">${logoBlock}</a>
                    <p style="margin:10px 0 0 0;font-size:13px;color:rgba(255,255,255,0.9);letter-spacing:0.5px;">Empowering communities through giving</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 32px 28px;color:${EMAIL_BRAND.text};">
                    ${content}
                  </td>
                </tr>
                <tr>
                  <td style="border-top:1px solid ${EMAIL_BRAND.border};padding:24px 32px;background:${EMAIL_BRAND.surface};">
                    <p style="margin:0 0 8px 0;font-size:12px;color:${EMAIL_BRAND.footer};text-align:center;">GiveBlack — Empowering communities through giving</p>
                    <p style="margin:0;font-size:12px;color:${EMAIL_BRAND.footer};text-align:center;">
                      <a href="${APP_URL}" style="color:${EMAIL_BRAND.primary};text-decoration:none;">${APP_URL.replace(/^https?:\/\//, "")}</a>
                      &nbsp;·&nbsp;
                      <a href="mailto:${SUPPORT_EMAIL}" style="color:${EMAIL_BRAND.primary};text-decoration:none;">${SUPPORT_EMAIL}</a>
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
}

/** Primary CTA button style for emails */
export function ctaButton(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="border-radius:10px;background:${EMAIL_BRAND.primary};">
          <a href="${href}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;">${label}</a>
        </td>
      </tr>
    </table>
  `.trim();
}

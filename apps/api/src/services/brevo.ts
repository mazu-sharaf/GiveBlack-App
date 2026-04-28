import { env } from "../config/env.js";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  tags?: string[];
  /** BCC recipients (e.g. admin copy) */
  bcc?: Array<{ email: string; name?: string }>;
}

function brevoApiKey(): string {
  const raw = env.BREVO_API_KEY || (env as { SENDINBLUE_API_KEY?: string }).SENDINBLUE_API_KEY || "";
  return String(raw)
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/^["']|["']$/g, "");
}

function brevoFromEmail(): string {
  const raw = env.BREVO_SENDER_EMAIL || (env as { BREVO_FROM_EMAIL?: string }).BREVO_FROM_EMAIL || "";
  return String(raw).trim();
}

export function isBrevoConfigured(): boolean {
  return Boolean(brevoApiKey() && brevoFromEmail());
}

/** Back-compat for callers: return a friendly config error or null when configured. */
export function getBrevoConfigError(): string | null {
  if (isBrevoConfigured()) return null;
  return "Brevo is not configured: set BREVO_API_KEY and BREVO_SENDER_EMAIL (verified sender) in server .env, then restart the API.";
}

/** Human-readable explanation for common Brevo API failures (operators copy .env from dashboard). */
export function formatBrevoHttpError(status: number, bodyText: string): string {
  let message = "";
  let code = "";
  try {
    const j = JSON.parse(bodyText) as { message?: string; code?: string };
    message = (j.message || "").trim();
    code = (j.code || "").trim();
  } catch {
    message = bodyText.trim().slice(0, 280);
  }

  if (status === 401) {
    const lower = `${message} ${code}`.toLowerCase();
    if (lower.includes("not enabled")) {
      return (
        `Brevo: API key is disabled in your Brevo account (401: ${message || "API Key is not enabled"}). ` +
        "In Brevo: CRM & Suite → Settings → SMTP & API → API keys — open your v3 key and ensure it is enabled, or create a new key, paste it as BREVO_API_KEY on the server, then pm2 restart giveblack-api. If .env has two BREVO_API_KEY lines, remove the old one (the last line wins)."
      );
    }
    return `Brevo authentication failed (401${message ? `: ${message}` : ""}). Check BREVO_API_KEY in server .env and restart the API.`;
  }

  if (status === 400 && /sender|domain|not valid|verify/i.test(message)) {
    return `Brevo send rejected (400): ${message || bodyText.slice(0, 200)}. Verify the sender email/domain in Brevo Senders & IP matches BREVO_SENDER_EMAIL.`;
  }

  return `Brevo send failed: ${status} ${bodyText.slice(0, 500)}`;
}

export async function sendBrevoEmail(input: SendEmailInput): Promise<void> {
  const apiKey = brevoApiKey();
  const fromEmail = brevoFromEmail();
  if (!apiKey || !fromEmail) {
    throw new Error(
      "Brevo is not configured: set BREVO_API_KEY and BREVO_SENDER_EMAIL (verified sender) in server .env, then restart the API."
    );
  }

  const payload: Record<string, unknown> = {
    sender: { email: fromEmail, name: env.BREVO_SENDER_NAME },
    to: [{ email: input.to }],
    subject: input.subject,
    htmlContent: input.html,
    tags: input.tags ?? ["giveblack"]
  };
  if (input.bcc?.length) {
    payload.bcc = input.bcc.map((r) => (r.name ? { email: r.email, name: r.name } : { email: r.email }));
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(formatBrevoHttpError(res.status, body));
  }
}

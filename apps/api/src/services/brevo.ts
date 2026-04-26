import { env } from "../config/env.js";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  tags?: string[];
  /** BCC recipients (e.g. admin copy) */
  bcc?: Array<{ email: string; name?: string }>;
}

export async function sendBrevoEmail(input: SendEmailInput): Promise<void> {
  const apiKey = env.BREVO_API_KEY || (env as { SENDINBLUE_API_KEY?: string }).SENDINBLUE_API_KEY;
  const fromEmail = env.BREVO_SENDER_EMAIL || (env as { BREVO_FROM_EMAIL?: string }).BREVO_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    throw new Error("Brevo is not configured");
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
    throw new Error(`Brevo send failed: ${res.status} ${body}`);
  }
}

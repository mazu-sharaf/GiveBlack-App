import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { env } from "../config/env.js";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  tags?: string[];
  bcc?: Array<{ email: string; name?: string }>;
}

function sesFromEmail(): string {
  return String(env.SES_FROM_EMAIL || "").trim();
}

function sesCredentials(): { accessKeyId: string; secretAccessKey: string } | null {
  const accessKeyId = String(env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(env.AWS_SECRET_ACCESS_KEY || "").trim();
  if (!accessKeyId || !secretAccessKey) return null;
  return { accessKeyId, secretAccessKey };
}

export function isSesConfigured(): boolean {
  return Boolean(sesCredentials() && sesFromEmail());
}

export function getSesConfigError(): string | null {
  if (isSesConfigured()) return null;
  return "AWS SES is not configured: set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and SES_FROM_EMAIL in server .env, then restart the API.";
}

let client: SESv2Client | undefined;

function getSesClient(): SESv2Client {
  if (!client) {
    const creds = sesCredentials();
    if (!creds) throw new Error(getSesConfigError() || "AWS SES not configured");
    client = new SESv2Client({
      region: env.AWS_REGION,
      credentials: creds,
    });
  }
  return client;
}

export async function sendSesEmail(input: SendEmailInput): Promise<void> {
  const fromEmail = sesFromEmail();
  if (!isSesConfigured()) {
    throw new Error(getSesConfigError() || "AWS SES not configured");
  }

  const fromName = env.SES_FROM_NAME?.trim();
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  const command = new SendEmailCommand({
    FromEmailAddress: from,
    Destination: {
      ToAddresses: [input.to],
      BccAddresses: input.bcc?.map((r) => r.email).filter(Boolean),
    },
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: "UTF-8" },
        Body: { Html: { Data: input.html, Charset: "UTF-8" } },
      },
    },
    ...(env.SES_CONFIGURATION_SET?.trim()
      ? { ConfigurationSetName: env.SES_CONFIGURATION_SET.trim() }
      : {}),
  });

  try {
    await getSesClient().send(command);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not verified|Email address is not verified/i.test(message)) {
      throw new Error(
        `AWS SES send rejected: ${message}. Verify ${fromEmail} or its domain in SES and ensure the From address matches a verified identity.`
      );
    }
    if (/sandbox|not authorized|AccessDenied/i.test(message)) {
      throw new Error(
        `AWS SES send failed: ${message}. Check IAM permissions (ses:SendEmail) and request production access if still in the SES sandbox.`
      );
    }
    throw new Error(`AWS SES send failed: ${message}`);
  }
}

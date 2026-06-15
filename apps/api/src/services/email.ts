import { getSesConfigError, isSesConfigured, sendSesEmail } from "./ses.js";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  tags?: string[];
  /** BCC recipients (e.g. admin copy) */
  bcc?: Array<{ email: string; name?: string }>;
}

export function emailProvider(): "ses" {
  return "ses";
}

export function isEmailConfigured(): boolean {
  return isSesConfigured();
}

export function getEmailConfigError(): string | null {
  return getSesConfigError();
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  await sendSesEmail(input);
}

import { env } from "../config/env.js";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { generateSecret, generateURI, verify } from "otplib";

type RecoveryCodeRow = { codeHash: string; usedAt: string | null };

function b64Key(): Buffer | null {
  const raw = String(env.ADMIN_2FA_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) return null;
    return buf;
  } catch {
    return null;
  }
}

export function isAdmin2faEncryptionConfigured(): boolean {
  return Boolean(b64Key());
}

export function encryptSecret(plain: string): string {
  const key = b64Key();
  if (!key) throw new Error("ADMIN_2FA_ENCRYPTION_KEY is not configured");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptSecret(enc: string): string {
  const key = b64Key();
  if (!key) throw new Error("ADMIN_2FA_ENCRYPTION_KEY is not configured");
  const parts = String(enc || "").split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted secret format");
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString("utf8");
}

export function generateTotpSecret(): { secret: string; otpauthUrl: string } {
  const secret = generateSecret();
  const otpauthUrl = generateURI({
    issuer: "GiveBlack Admin",
    label: "admin",
    secret,
    strategy: "totp",
  });
  return { secret, otpauthUrl };
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const cleaned = String(code || "").replace(/\s+/g, "");
  try {
    // allow small clock drift
    return Boolean(
      // `verify` returns { valid, ... }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (verify({ secret, token: cleaned, strategy: "totp", window: 1 } as any) as any)?.valid
    );
  } catch {
    return false;
  }
}

export async function generateRecoveryCodes(count = 10): Promise<{ plain: string[]; stored: RecoveryCodeRow[] }> {
  const plain: string[] = [];
  const stored: RecoveryCodeRow[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(10).toString("hex"); // 20 chars
    const pretty = `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
    plain.push(pretty);
    const codeHash = await bcrypt.hash(pretty, 12);
    stored.push({ codeHash, usedAt: null });
  }
  return { plain, stored };
}

export async function consumeRecoveryCode(
  stored: RecoveryCodeRow[] | null | undefined,
  inputCode: string
): Promise<{ ok: boolean; next: RecoveryCodeRow[] }> {
  const codes = Array.isArray(stored) ? stored : [];
  const cleaned = String(inputCode || "").trim();
  if (!cleaned) return { ok: false, next: codes };
  for (let i = 0; i < codes.length; i++) {
    const row = codes[i];
    if (!row || row.usedAt) continue;
    const match = await bcrypt.compare(cleaned, row.codeHash);
    if (match) {
      const next = codes.map((c, idx) => (idx === i ? { ...c, usedAt: new Date().toISOString() } : c));
      return { ok: true, next };
    }
  }
  return { ok: false, next: codes };
}


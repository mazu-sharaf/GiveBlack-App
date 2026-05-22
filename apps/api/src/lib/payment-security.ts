import crypto from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../config/env.js";

type RateLimitBucket = {
  count: number;
  windowStart: number;
};

type DonationSessionPayload = {
  purpose: "donation";
  sessionId: string;
  iat: number;
  exp: number;
  orgId: string;
  campaignId: string;
  amountCents: number;
  currency: string;
  identityHash: string;
  source: string;
};

export type DonationSessionInput = {
  orgId: string;
  campaignId?: string | null;
  amount: number;
  currency?: string | null;
  email?: string | null;
  userId?: string | null;
  source?: string | null;
};

export type PaymentRateLimitInput = {
  action: string;
  ip: string;
  email?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  amount?: number | null;
  /** Use stricter per-IP / per-identity caps (guest + public Stripe creation). */
  strict?: boolean;
  logger?: FastifyBaseLogger;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const failedAttemptBuckets = new Map<string, RateLimitBucket>();
const usedDonationSessionIds = new Map<string, number>();

type VelocityBucket = {
  windowStart: number;
  total: number;
  lowCount: number;
  alerted: boolean;
};

const velocityBuckets = new Map<string, VelocityBucket>();

function envInt(name: keyof typeof env, fallback: number): number {
  const raw = env[name];
  if (raw == null || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizePaymentEmail(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function normalizeCurrency(value: string | null | undefined): string {
  return (value || "usd").trim().toLowerCase();
}

function amountCents(amount: number): number {
  return Math.round(Number(amount || 0) * 100);
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function fromBase64url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function securitySecret(): string {
  return env.PAYMENT_SECURITY_TOKEN_SECRET || env.JWT_ACCESS_SECRET;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", securitySecret()).update(value).digest("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function hashPaymentIdentifier(value: string | null | undefined): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  return crypto.createHash("sha256").update(`${securitySecret()}:${normalized}`).digest("hex").slice(0, 32);
}

export function paymentClientIp(request: { ip?: string; headers?: Record<string, unknown> }): string {
  const headers = request.headers || {};
  const cfIp = headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.trim()) return cfIp.trim();
  const forwarded = headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0]?.trim() || request.ip || "unknown";
  return request.ip || "unknown";
}

function pruneBuckets(map: Map<string, RateLimitBucket>, now: number, windowMs: number): void {
  for (const [key, bucket] of map.entries()) {
    if (now - bucket.windowStart >= windowMs) map.delete(key);
  }
}

function consumeBucket(map: Map<string, RateLimitBucket>, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  pruneBuckets(map, now, windowMs);
  const bucket = map.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    map.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function bucketCount(map: Map<string, RateLimitBucket>, key: string, windowMs: number): number {
  const now = Date.now();
  const bucket = map.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    if (bucket) map.delete(key);
    return 0;
  }
  return bucket.count;
}

function observeLowAmountVelocity(input: {
  action: string;
  ip: string;
  amount: number | null | undefined;
  logger?: FastifyBaseLogger;
}): void {
  const windowMs = envInt("PAYMENT_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000);
  const maxUsd = envInt("PAYMENT_VELOCITY_LOW_USD_MAX", 2);
  if (maxUsd <= 0) return;
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const thresholdCents = maxUsd * 100;
  const amountCents = Math.round(amount * 100);
  const ipHash = hashPaymentIdentifier(input.ip);
  const key = `${input.action}:vel:${ipHash}`;
  const now = Date.now();
  const totalMin = envInt("PAYMENT_VELOCITY_LOW_IP_TOTAL_MIN", 18);
  const lowMin = envInt("PAYMENT_VELOCITY_LOW_IP_LOW_COUNT_MIN", 14);

  for (const [vk, vb] of velocityBuckets.entries()) {
    if (now - vb.windowStart >= windowMs) velocityBuckets.delete(vk);
  }
  let b = velocityBuckets.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    b = { windowStart: now, total: 0, lowCount: 0, alerted: false };
    velocityBuckets.set(key, b);
  }
  b.total += 1;
  if (amountCents > 0 && amountCents <= thresholdCents) b.lowCount += 1;

  if (!b.alerted && b.total >= totalMin && b.lowCount >= lowMin) {
    b.alerted = true;
    logPaymentSecurityEvent(input.logger, "suspicious_low_amount_velocity", {
      action: input.action,
      ipHash,
      total: b.total,
      lowCount: b.lowCount,
      windowMs,
    });
  }
}

export function checkPaymentRateLimit(input: PaymentRateLimitInput): { allowed: boolean; reason?: string } {
  const windowMs = envInt("PAYMENT_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000);
  const ipLimit = input.strict
    ? envInt("PAYMENT_RATE_LIMIT_STRICT_IP_LIMIT", 6)
    : envInt("PAYMENT_RATE_LIMIT_IP_LIMIT", 12);
  const identityLimit = input.strict
    ? envInt("PAYMENT_RATE_LIMIT_STRICT_IDENTITY_LIMIT", 3)
    : envInt("PAYMENT_RATE_LIMIT_IDENTITY_LIMIT", 6);
  const failedLimit = envInt("PAYMENT_FAILED_ATTEMPT_LIMIT", 5);
  const ipHash = hashPaymentIdentifier(input.ip);
  const emailHash = hashPaymentIdentifier(input.email);
  const userHash = hashPaymentIdentifier(input.userId);
  const sessionHash = hashPaymentIdentifier(input.sessionId);
  const identityHash = userHash || emailHash || sessionHash;

  if (!consumeBucket(rateLimitBuckets, `${input.action}:ip:${ipHash}`, ipLimit, windowMs)) {
    return { allowed: false, reason: "Too many payment attempts. Please wait and try again." };
  }
  if (identityHash && !consumeBucket(rateLimitBuckets, `${input.action}:identity:${identityHash}`, identityLimit, windowMs)) {
    return { allowed: false, reason: "Too many payment attempts. Please wait and try again." };
  }
  if (identityHash && bucketCount(failedAttemptBuckets, `precheck:${identityHash}`, windowMs) >= failedLimit) {
    return { allowed: false, reason: "Payment attempts are temporarily limited. Please try again later." };
  }
  observeLowAmountVelocity({
    action: input.action,
    ip: input.ip,
    amount: input.amount ?? null,
    logger: input.logger,
  });
  return { allowed: true };
}

/** Test helper: clears in-memory payment security state. */
export function resetPaymentSecurityStateForTests(): void {
  rateLimitBuckets.clear();
  failedAttemptBuckets.clear();
  usedDonationSessionIds.clear();
  velocityBuckets.clear();
}

export function recordPaymentFailure(input: {
  email?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  logger?: FastifyBaseLogger;
  paymentIntentId?: string | null;
  reason?: string | null;
}): void {
  const windowMs = envInt("PAYMENT_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000);
  const emailHash = hashPaymentIdentifier(input.email);
  const userHash = hashPaymentIdentifier(input.userId);
  const sessionHash = hashPaymentIdentifier(input.sessionId);
  const keys = [emailHash, userHash, sessionHash].filter(Boolean);
  for (const key of keys) consumeBucket(failedAttemptBuckets, `precheck:${key}`, Number.MAX_SAFE_INTEGER, windowMs);
  logPaymentSecurityEvent(input.logger, "stripe_payment_failed", {
    emailHash,
    userHash,
    sessionHash,
    paymentIntentId: input.paymentIntentId || undefined,
    reason: input.reason || undefined,
  });
}

export async function verifyTurnstileToken(input: {
  token?: string | null;
  ip?: string | null;
  logger?: FastifyBaseLogger;
}): Promise<{ ok: boolean; reason?: string; bypassed?: boolean }> {
  const token = String(input.token || "").trim();
  if (!env.CLOUDFLARE_TURNSTILE_SECRET_KEY) {
    if (env.NODE_ENV !== "production" && env.CLOUDFLARE_TURNSTILE_DEV_BYPASS === "1") {
      logPaymentSecurityEvent(input.logger, "turnstile_dev_bypass", {});
      return { ok: true, bypassed: true };
    }
    return { ok: false, reason: "Bot protection is not configured." };
  }
  if (!token) return { ok: false, reason: "Bot verification is required." };

  const form = new URLSearchParams();
  form.set("secret", env.CLOUDFLARE_TURNSTILE_SECRET_KEY);
  form.set("response", token);
  if (input.ip) form.set("remoteip", input.ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success) return { ok: true };
    logPaymentSecurityEvent(input.logger, "turnstile_failed", { errorCodes: data["error-codes"] || [] });
    return { ok: false, reason: "Bot verification failed. Please try again." };
  } catch (err) {
    logPaymentSecurityEvent(input.logger, "turnstile_error", { err: err instanceof Error ? err.message : String(err) });
    return { ok: false, reason: "Bot verification is temporarily unavailable. Please try again." };
  }
}

export function createDonationSessionToken(input: DonationSessionInput): { token: string; sessionId: string; expiresAt: string } {
  const ttlSeconds = envInt("PAYMENT_DONATION_SESSION_TTL_SECONDS", 10 * 60);
  const now = Math.floor(Date.now() / 1000);
  const identity = input.userId ? `user:${input.userId}` : `email:${normalizePaymentEmail(input.email) || "anonymous"}`;
  const payload: DonationSessionPayload = {
    purpose: "donation",
    sessionId: crypto.randomUUID(),
    iat: now,
    exp: now + ttlSeconds,
    orgId: input.orgId,
    campaignId: input.campaignId || "",
    amountCents: amountCents(input.amount),
    currency: normalizeCurrency(input.currency),
    identityHash: hashPaymentIdentifier(identity),
    source: input.source || "unknown",
  };
  const encoded = base64url(JSON.stringify(payload));
  return {
    token: `${encoded}.${sign(encoded)}`,
    sessionId: payload.sessionId,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export function verifyDonationSessionToken(
  token: string | null | undefined,
  expected: DonationSessionInput,
  opts?: { consume?: boolean }
): { ok: boolean; reason?: string; payload?: DonationSessionPayload } {
  const raw = String(token || "").trim();
  if (!raw) return { ok: false, reason: "Donation session is required." };
  const [encoded, sig] = raw.split(".");
  if (!encoded || !sig || !timingSafeEqual(sign(encoded), sig)) {
    return { ok: false, reason: "Invalid donation session." };
  }

  let payload: DonationSessionPayload;
  try {
    payload = JSON.parse(fromBase64url(encoded)) as DonationSessionPayload;
  } catch {
    return { ok: false, reason: "Invalid donation session." };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.purpose !== "donation" || payload.exp <= now) return { ok: false, reason: "Donation session expired." };
  if (payload.orgId !== expected.orgId) return { ok: false, reason: "Donation session mismatch." };
  if (payload.campaignId !== (expected.campaignId || "")) return { ok: false, reason: "Donation session mismatch." };
  if (payload.amountCents !== amountCents(expected.amount)) return { ok: false, reason: "Donation session mismatch." };
  if (payload.currency !== normalizeCurrency(expected.currency)) return { ok: false, reason: "Donation session mismatch." };

  const expectedIdentity = expected.userId
    ? `user:${expected.userId}`
    : `email:${normalizePaymentEmail(expected.email) || "anonymous"}`;
  if (payload.identityHash !== hashPaymentIdentifier(expectedIdentity)) return { ok: false, reason: "Donation session mismatch." };

  const usedUntil = usedDonationSessionIds.get(payload.sessionId);
  if (usedUntil && usedUntil > now) return { ok: false, reason: "Donation session was already used." };
  if (opts?.consume) usedDonationSessionIds.set(payload.sessionId, payload.exp);

  for (const [sessionId, exp] of usedDonationSessionIds.entries()) {
    if (exp <= now) usedDonationSessionIds.delete(sessionId);
  }
  return { ok: true, payload };
}

export function logPaymentSecurityEvent(
  logger: FastifyBaseLogger | undefined,
  event: string,
  details: Record<string, unknown>
): void {
  const safeDetails = Object.fromEntries(
    Object.entries(details).filter(([key]) => !/token|secret|clientSecret|ephemeralKey|payment_method/i.test(key))
  );
  logger?.warn({ paymentSecurityEvent: event, ...safeDetails }, "payment security event");
}

export function stripeSecurityMetadata(input: {
  donationSessionId?: string | null;
  donationId?: string | null;
  donorEmail?: string | null;
  donorName?: string | null;
  userId?: string | null;
  orgId?: string | null;
  campaignId?: string | null;
  source?: string | null;
  ip?: string | null;
}): Record<string, string> {
  return {
    appEnv: env.NODE_ENV,
    donationSessionId: input.donationSessionId || "",
    donationId: input.donationId || "",
    donorEmail: normalizePaymentEmail(input.donorEmail),
    donorName: input.donorName || "",
    donorUserId: input.userId || "",
    orgId: input.orgId || "",
    campaignId: input.campaignId || "",
    source: input.source || "",
    ipHash: hashPaymentIdentifier(input.ip),
  };
}

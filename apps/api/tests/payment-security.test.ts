import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-jwt-access-secret-at-least-32-characters";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-at-least-32-characters";
process.env.CLOUDFLARE_TURNSTILE_DEV_BYPASS = "1";

const security = await import("../src/lib/payment-security.js");

test("donation session tokens validate matching donation details", () => {
  const session = security.createDonationSessionToken({
    orgId: "org_123",
    campaignId: "camp_123",
    amount: 5,
    currency: "usd",
    email: "donor@example.com",
    source: "test",
  });

  const result = security.verifyDonationSessionToken(session.token, {
    orgId: "org_123",
    campaignId: "camp_123",
    amount: 5,
    currency: "usd",
    email: "donor@example.com",
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload?.sessionId, session.sessionId);
});

test("donation session tokens reject amount mismatches", () => {
  const session = security.createDonationSessionToken({
    orgId: "org_123",
    campaignId: "camp_123",
    amount: 5,
    currency: "usd",
    email: "donor@example.com",
    source: "test",
  });

  const result = security.verifyDonationSessionToken(session.token, {
    orgId: "org_123",
    campaignId: "camp_123",
    amount: 10,
    currency: "usd",
    email: "donor@example.com",
  });

  assert.equal(result.ok, false);
});

test("consumed donation session tokens cannot be reused", () => {
  const session = security.createDonationSessionToken({
    orgId: "org_123",
    amount: 5,
    currency: "usd",
    email: "donor@example.com",
    source: "test",
  });

  const first = security.verifyDonationSessionToken(
    session.token,
    { orgId: "org_123", amount: 5, currency: "usd", email: "donor@example.com" },
    { consume: true }
  );
  const second = security.verifyDonationSessionToken(
    session.token,
    { orgId: "org_123", amount: 5, currency: "usd", email: "donor@example.com" },
    { consume: true }
  );

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
});

test("Turnstile development bypass is explicit", async () => {
  const result = await security.verifyTurnstileToken({ token: "" });

  assert.equal(result.ok, true);
  assert.equal(result.bypassed, true);
});

test("strict rate limit blocks high-frequency same IP (no identity key)", () => {
  security.resetPaymentSecurityStateForTests();
  const base = {
    action: "strict-rl-test",
    ip: "203.0.113.9",
    amount: 5 as number,
    strict: true as const,
  };
  for (let i = 0; i < 6; i++) {
    const r = security.checkPaymentRateLimit(base);
    assert.equal(r.allowed, true, `iteration ${i}`);
  }
  const blocked = security.checkPaymentRateLimit(base);
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason || "", /try again/i);
});

test("strict rate limit blocks per-identity before IP cap", () => {
  security.resetPaymentSecurityStateForTests();
  const base = {
    action: "strict-id-test",
    ip: "203.0.113.10",
    email: "id-cap@example.com",
    amount: 3 as number,
    strict: true as const,
  };
  for (let i = 0; i < 3; i++) {
    assert.equal(security.checkPaymentRateLimit(base).allowed, true);
  }
  assert.equal(security.checkPaymentRateLimit(base).allowed, false);
});

test("donation session validates logged-in donor identity", () => {
  security.resetPaymentSecurityStateForTests();
  const session = security.createDonationSessionToken({
    orgId: "org_1",
    campaignId: "camp_1",
    amount: 25,
    currency: "usd",
    userId: "user-uuid-1",
    source: "test",
  });
  const ok = security.verifyDonationSessionToken(session.token, {
    orgId: "org_1",
    campaignId: "camp_1",
    amount: 25,
    currency: "usd",
    userId: "user-uuid-1",
    source: "test",
  });
  assert.equal(ok.ok, true);
  const badUser = security.verifyDonationSessionToken(session.token, {
    orgId: "org_1",
    campaignId: "camp_1",
    amount: 25,
    currency: "usd",
    userId: "other-user",
    source: "test",
  });
  assert.equal(badUser.ok, false);
});

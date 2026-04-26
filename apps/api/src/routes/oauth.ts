import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import * as jose from "jose";
import { db } from "../lib/db.js";
import { env } from "../config/env.js";
import { issueSessionForUser } from "./auth.js";

const googleBody = z.object({ idToken: z.string().min(10) });
const appleBody = z.object({
  identityToken: z.string().min(10),
  fullName: z.string().min(1).max(120).optional(),
});
type Role = "super_admin" | "admin" | "charity_owner" | "donor";

type JwtApp = { jwt: { sign: (payload: Record<string, unknown>, opts: Record<string, unknown>) => string } };

async function loadProfileForUser(userId: string): Promise<Record<string, unknown>> {
  try {
    const profileQuery = await db.query(
      "select user_type, zip_code, college_attended, charity_name, charity_category, charity_description, charity_url from profiles where id = $1 limit 1",
      [userId]
    );
    if (profileQuery.rowCount) return profileQuery.rows[0] as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return {};
}

async function buildAuthResponse(
  app: JwtApp,
  request: { headers: Record<string, string | string[] | undefined>; ip?: string },
  user: { id: string; email: string; full_name: string; role: Role; avatar_url?: string | null }
) {
  const tokens = await issueSessionForUser(app, request, {
    id: user.id,
    email: user.email,
    role: user.role,
  });
  const profileData = await loadProfileForUser(user.id);
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.full_name,
      role: user.role,
      avatar_url: user.avatar_url ?? null,
      type: profileData.user_type || (user.role === "charity_owner" ? "charity" : "donor"),
      zipCode: profileData.zip_code,
      collegeAttended: profileData.college_attended,
      charityName: profileData.charity_name,
      charityCategory: profileData.charity_category,
      charityDescription: profileData.charity_description,
      charityUrl: profileData.charity_url,
    },
  };
}

async function findOrCreateOAuthDonor(
  app: JwtApp,
  request: { headers: Record<string, string | string[] | undefined>; ip?: string },
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
  provider: "google" | "apple",
  providerUserId: string,
  email: string | undefined,
  fullName: string,
  avatarUrl?: string | null
) {
  const emailNorm = email?.toLowerCase().trim();
  if (!emailNorm) {
    return reply.code(400).send({ error: "Your account did not return an email. Allow email access or try another sign-in method." });
  }

  const existingOAuth = await db.query(
    `select u.id, u.email, u.full_name, u.role, u.disabled_at, u.avatar_url
     from oauth_identities o
     join users u on u.id = o.user_id
     where o.provider = $1 and o.provider_user_id = $2
     limit 1`,
    [provider, providerUserId]
  );
  if (existingOAuth.rowCount) {
    const u = existingOAuth.rows[0] as {
      id: string;
      email: string;
      full_name: string;
      role: Role;
      disabled_at?: string | null;
      avatar_url?: string | null;
    };
    if (u.disabled_at) return reply.code(403).send({ error: "This account has been disabled." });
    if (u.role !== "donor") {
      return reply.code(403).send({
        error: "This sign-in is for donor accounts only. Use the organization login for charity accounts.",
      });
    }

    // Best-effort: if user has no avatar yet, store provider avatar.
    if (!u.avatar_url && avatarUrl) {
      try {
        await db.query("update users set avatar_url = $1, avatar_source = $2 where id = $3", [
          avatarUrl,
          provider,
          u.id,
        ]);
        u.avatar_url = avatarUrl;
      } catch {
        /* ignore */
      }
    }
    return buildAuthResponse(app, request, u);
  }

  const emailRow = await db.query(`select id, role, password_hash from users where email = $1 limit 1`, [emailNorm]);
  if (emailRow.rowCount) {
    const row = emailRow.rows[0] as { id: string; role: Role; password_hash: string | null };
    if (row.role !== "donor") {
      return reply.code(409).send({
        error: "An account with this email already exists for an organization. Use the charity login.",
      });
    }
    return reply.code(409).send({
      error: "An account with this email already exists. Sign in with your password, or contact support to link social login.",
    });
  }

  const created = await db.query(
    `insert into users (email, full_name, password_hash, role, avatar_url, avatar_source)
     values ($1, $2, null, 'donor', $3, $4)
     returning id, email, full_name, role, avatar_url`,
    [emailNorm, fullName, avatarUrl || null, avatarUrl ? provider : null]
  );
  const user = created.rows[0] as { id: string; email: string; full_name: string; role: Role; avatar_url?: string | null };
  await db.query(`insert into oauth_identities (user_id, provider, provider_user_id) values ($1, $2, $3)`, [
    user.id,
    provider,
    providerUserId,
  ]);
  try {
    await db.query(
      `insert into profiles (id, name, email, user_type) values ($1, $2, $3, 'donor')
       on conflict (id) do nothing`,
      [user.id, fullName, emailNorm]
    );
  } catch {
    /* ignore */
  }

  return buildAuthResponse(app, request, user);
}

export const oauthRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/auth/oauth/google", async (request, reply) => {
    const audiences = env.GOOGLE_OAUTH_CLIENT_IDS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!audiences?.length) {
      return reply.code(503).send({ error: "Google sign-in is not configured on the server." });
    }
    const body = googleBody.parse(request.body);
    try {
      const client = new OAuth2Client();
      const ticket = await client.verifyIdToken({ idToken: body.idToken, audience: audiences });
      const payload = ticket.getPayload();
      if (!payload?.sub) return reply.code(401).send({ error: "Invalid Google token" });
      const email = payload.email;
      const name =
        payload.name ||
        (email ? email.split("@")[0] : "User");
      const avatarUrl = typeof payload.picture === "string" ? payload.picture : null;
      return findOrCreateOAuthDonor(app, request, reply, "google", payload.sub, email, name, avatarUrl);
    } catch (e: unknown) {
      app.log.error({ err: e }, "google oauth verify failed");
      return reply.code(401).send({ error: "Invalid or expired Google token" });
    }
  });

  app.post("/api/auth/oauth/apple", async (request, reply) => {
    if (!env.APPLE_CLIENT_ID) {
      return reply.code(503).send({ error: "Apple sign-in is not configured on the server." });
    }
    const body = appleBody.parse(request.body);
    try {
      const JWKS = jose.createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

      // Decode header/claims first so we can log useful context on failure
      const decoded = jose.decodeJwt(body.identityToken);
      const tokenAud = Array.isArray(decoded.aud) ? decoded.aud[0] : decoded.aud;
      app.log.info({ aud: tokenAud, iss: decoded.iss, sub: decoded.sub, exp: decoded.exp }, "apple token claims");

      // Accepted audiences:
      // 1. The configured bundle ID (com.giveblack.app) — production / EAS native builds
      // 2. host.exp.Exponent — Expo Go development testing (different Apple sub from native build)
      const acceptedAudiences = [env.APPLE_CLIENT_ID, "host.exp.Exponent"].filter(Boolean) as string[];
      const matchingAudience = acceptedAudiences.find((aud) => aud === tokenAud);
      if (!matchingAudience) {
        app.log.error({ tokenAud, acceptedAudiences }, "apple aud mismatch");
        return reply.code(401).send({
          error: `Apple token audience mismatch — token has "${tokenAud}", server accepts: ${acceptedAudiences.join(", ")}`,
        });
      }

      // Verify with the actual audience from the token so jose doesn't reject it
      const { payload } = await jose.jwtVerify(body.identityToken, JWKS, {
        issuer: "https://appleid.apple.com",
        audience: matchingAudience,
        clockTolerance: "5m",
      });
      const sub = typeof payload.sub === "string" ? payload.sub : "";
      if (!sub) return reply.code(401).send({ error: "Invalid Apple token" });
      const email = typeof payload.email === "string" ? payload.email : undefined;
      let fullName = body.fullName?.trim() || "";
      if (!fullName) fullName = email ? email.split("@")[0] : "User";
      return findOrCreateOAuthDonor(app, request, reply, "apple", sub, email, fullName);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      app.log.error({ err: e, clientId: env.APPLE_CLIENT_ID }, `apple oauth verify failed: ${msg}`);
      return reply.code(401).send({ error: "Invalid or expired Apple token" });
    }
  });
};

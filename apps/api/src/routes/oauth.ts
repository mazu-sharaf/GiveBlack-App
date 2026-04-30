import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import * as jose from "jose";
import { db } from "../lib/db.js";
import { env } from "../config/env.js";
import { issueSessionForUser } from "./auth.js";

const googleBody = z.object({
  idToken: z.string().min(10),
  /** Profile image URL from native Google Sign-In when the ID token omits `picture`. */
  pictureUrl: z.string().max(2048).optional(),
});
const appleBody = z.object({
  identityToken: z.string().min(10),
  fullName: z.string().min(1).max(120).optional(),
});
type Role = "super_admin" | "admin" | "charity_owner" | "donor";

type JwtApp = { jwt: { sign: (payload: Record<string, unknown>, opts: Record<string, unknown>) => string } };

function isApplePrivateRelayEmail(email?: string): boolean {
  return /@privaterelay\.appleid\.com$/i.test((email || "").trim());
}

function getDefaultOAuthName(provider: "google" | "apple", email?: string): string {
  const emailNorm = email?.trim().toLowerCase();
  if (!emailNorm) return "User";
  if (provider === "apple" && isApplePrivateRelayEmail(emailNorm)) {
    return "Apple User";
  }
  return emailNorm.split("@")[0] || "User";
}

function buildGeneratedAvatarUrl(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=39C27A&color=ffffff&size=256&bold=true`;
}

function sanitizeOptionalHttpUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

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
  providerAvatarUrl?: string | null
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
      avatar_url?: string | null;
      disabled_at?: string | null;
    };
    if (u.disabled_at) return reply.code(403).send({ error: "This account has been disabled." });
    if (u.role !== "donor") {
      return reply.code(403).send({
        error: "This sign-in is for donor accounts only. Use the organization login for charity accounts.",
      });
    }

    // Best-effort: if user has no avatar yet, store provider avatar.
    if (!u.avatar_url && providerAvatarUrl) {
      try {
        await db.query("update users set avatar_url = $1, avatar_source = $2 where id = $3", [
          providerAvatarUrl,
          provider,
          u.id,
        ]);
        u.avatar_url = providerAvatarUrl;
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

    // Existing user by email: link OAuth provider to this same user.
    const existingForUser = await db.query(
      `select provider_user_id from oauth_identities where user_id = $1 and provider = $2 limit 1`,
      [row.id, provider]
    );
    if (existingForUser.rowCount) {
      const existing = existingForUser.rows[0] as { provider_user_id: string };
      if (String(existing.provider_user_id) !== String(providerUserId)) {
        return reply.code(409).send({
          error:
            "This account is already linked to a different social login. Please sign in with password or contact support.",
        });
      }
      const uRes = await db.query(
        "select id, email, full_name, role, disabled_at, avatar_url from users where id = $1 limit 1",
        [row.id]
      );
      const u = uRes.rows[0] as {
        id: string;
        email: string;
        full_name: string;
        role: Role;
        disabled_at?: string | null;
        avatar_url?: string | null;
      };
      if (u?.disabled_at) return reply.code(403).send({ error: "This account has been disabled." });
      return buildAuthResponse(app, request, u);
    }

    await db.query(
      `insert into oauth_identities (user_id, provider, provider_user_id) values ($1, $2, $3)`,
      [row.id, provider, providerUserId]
    );

    // Best-effort: if user has no avatar yet, store provider avatar.
    if (providerAvatarUrl) {
      try {
        await db.query(
          `update users
           set avatar_url = coalesce(nullif(avatar_url, ''), $1),
               avatar_source = case when avatar_url is null or avatar_url = '' then $2 else avatar_source end
           where id = $3`,
          [providerAvatarUrl, provider, row.id]
        );
      } catch {
        /* ignore */
      }
    }

    const uRes = await db.query(
      "select id, email, full_name, role, disabled_at, avatar_url from users where id = $1 limit 1",
      [row.id]
    );
    const u = uRes.rows[0] as {
      id: string;
      email: string;
      full_name: string;
      role: Role;
      disabled_at?: string | null;
      avatar_url?: string | null;
    };
    if (u?.disabled_at) return reply.code(403).send({ error: "This account has been disabled." });
    return buildAuthResponse(app, request, u);
  }

  const avatarUrl = providerAvatarUrl || buildGeneratedAvatarUrl(fullName);
  const avatarSource = providerAvatarUrl ? provider : "generated";
  const created = await db.query(
    `insert into users (email, full_name, password_hash, role, avatar_url, avatar_source)
     values ($1, $2, null, 'donor', $3, $4)
     returning id, email, full_name, role, avatar_url`,
    [emailNorm, fullName, avatarUrl || null, avatarSource]
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
    // IMPORTANT: use process.env for Expo public keys — the Zod env parser intentionally drops unknown keys.
    const audiences = Array.from(
      new Set(
        [
          ...(process.env.GOOGLE_OAUTH_CLIENT_IDS?.split(",") ?? []),
          process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
          process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
          process.env.ADMIN_GOOGLE_CLIENT_ID,
        ]
          .flatMap((v) => (v ? String(v).split(",") : []))
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
    if (!audiences?.length) {
      return reply.code(503).send({ error: "Google sign-in is not configured on the server." });
    }
    let body: z.infer<typeof googleBody>;
    try {
      body = googleBody.parse(request.body);
    } catch (e: unknown) {
      if (e instanceof z.ZodError) {
        return reply.code(400).send({ error: "Invalid Google OAuth payload." });
      }
      throw e;
    }
    try {
      const client = new OAuth2Client();
      const ticket = await client.verifyIdToken({ idToken: body.idToken, audience: audiences });
      const payload = ticket.getPayload();
      if (!payload?.sub) return reply.code(401).send({ error: "Invalid Google token" });
      const email = payload.email;
      const name = payload.name || getDefaultOAuthName("google", email);
      const clientPicture = sanitizeOptionalHttpUrl(body.pictureUrl);
      const tokenPicture = typeof payload.picture === "string" ? payload.picture : null;
      const avatarUrl = clientPicture || tokenPicture;
      return findOrCreateOAuthDonor(app, request, reply, "google", payload.sub, email, name, avatarUrl);
    } catch (e: unknown) {
      // Log token audience for debugging (do not trust this without signature verification).
      try {
        const token = (request.body as any)?.idToken;
        if (typeof token === "string" && token.includes(".")) {
          const [, payloadB64] = token.split(".");
          const json = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
          const payload = JSON.parse(json) as { aud?: string | string[]; iss?: string; exp?: number; email?: string };
          const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
          app.log.error({ err: e, aud, iss: payload.iss, exp: payload.exp, email: payload.email, audiences }, "google oauth verify failed");
        } else {
          app.log.error({ err: e, audiences }, "google oauth verify failed");
        }
      } catch {
        app.log.error({ err: e, audiences }, "google oauth verify failed");
      }
      return reply.code(401).send({ error: "Invalid or expired Google token" });
    }
  });

  app.post("/api/auth/oauth/apple", async (request, reply) => {
    if (!env.APPLE_CLIENT_ID) {
      return reply.code(503).send({ error: "Apple sign-in is not configured on the server." });
    }
    let body: z.infer<typeof appleBody>;
    try {
      body = appleBody.parse(request.body);
    } catch (e: unknown) {
      if (e instanceof z.ZodError) {
        return reply.code(400).send({ error: "Invalid Apple OAuth payload." });
      }
      throw e;
    }
    try {
      const JWKS = jose.createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

      // Decode header/claims first so we can log useful context on failure
      const decoded = jose.decodeJwt(body.identityToken);
      const tokenAud = Array.isArray(decoded.aud) ? decoded.aud[0] : decoded.aud;
      app.log.info({ aud: tokenAud, iss: decoded.iss, sub: decoded.sub, exp: decoded.exp }, "apple token claims");

      // Accepted audiences:
      // 1. The configured bundle ID (com.giveblack.app): production / EAS native builds
      // 2. host.exp.Exponent: Expo Go development testing (different Apple sub from native build)
      const acceptedAudiences = [env.APPLE_CLIENT_ID, "host.exp.Exponent"].filter(Boolean) as string[];
      const matchingAudience = acceptedAudiences.find((aud) => aud === tokenAud);
      if (!matchingAudience) {
        app.log.error({ tokenAud, acceptedAudiences }, "apple aud mismatch");
        return reply.code(401).send({
          error: `Apple token audience mismatch: token has "${tokenAud}", server accepts: ${acceptedAudiences.join(", ")}`,
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
      if (!fullName) fullName = getDefaultOAuthName("apple", email);
      return findOrCreateOAuthDonor(app, request, reply, "apple", sub, email, fullName, null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      app.log.error({ err: e, clientId: env.APPLE_CLIENT_ID }, `apple oauth verify failed: ${msg}`);
      return reply.code(401).send({ error: "Invalid or expired Apple token" });
    }
  });
};

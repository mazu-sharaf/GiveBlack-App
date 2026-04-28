import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { env } from "./config/env.js";
import { buildServer } from "./server.js";
import { db } from "./lib/db.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

async function initDatabase() {
  const schemaPath = path.resolve(currentDir, "db/schema.sql");
  const schema = await readFile(schemaPath, "utf8");
  await db.query(schema);

  const seedPath = path.resolve(currentDir, "db/seed.sql");
  const seed = await readFile(seedPath, "utf8");
  await db.query(seed);

  const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (adminPassword) {
    const bcrypt = await import("bcryptjs");
    const adminHash = await bcrypt.default.hash(adminPassword, 12);
    await db.query(
      `INSERT INTO users (email, full_name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      ["admin@giveblackapp.com", "Platform Admin", adminHash, "admin"]
    );
    console.log("Admin user ensured.");
  }
  console.log("Database initialized.");
}

const app = buildServer();

const start = async () => {
  try {
    if (!process.env.VPS_BACKEND_URL) {
      await initDatabase();
    } else {
      console.log(`VPS proxy mode: forwarding API requests to ${process.env.VPS_BACKEND_URL}`);
      const dbUrl = process.env.DATABASE_URL || "";
      if (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")) {
        console.warn(
          "[api] DATABASE_URL points to localhost while VPS_BACKEND_URL is set. /api/org/* and /api/upload run on this process and must use the same DB as auth (or JWT user lookups will fail). Prefer DATABASE_URL matching the production database."
        );
      }
    }
    await app.listen({ port: env.PORT, host: env.API_HOST });
    app.log.info(`API listening on ${env.API_HOST}:${env.PORT}`);

    if (!process.env.VPS_BACKEND_URL && env.STRIPE_SECRET_KEY) {
      const { runAutoReleaseEligibleConnectHolds } = await import("./lib/org-auto-release.js");
      const intervalMs = Math.max(
        60_000,
        parseInt(process.env.AUTO_CONNECT_RELEASE_INTERVAL_MS || `${15 * 60 * 1000}`, 10) || 15 * 60 * 1000
      );
      const tick = () => {
        void runAutoReleaseEligibleConnectHolds()
          .then((r) => {
            if (r.transfers > 0) {
              app.log.info(
                { transfers: r.transfers, amount_cents: r.amount_cents, orgs: r.orgsAttempted },
                "auto Connect release (post-hold) completed"
              );
            }
            if (r.errors.length) app.log.warn({ errors: r.errors }, "auto Connect release reported errors");
          })
          .catch((e) => app.log.error(e, "auto Connect release failed"));
      };
      setInterval(tick, intervalMs);
      tick();
    }

    if (!env.EXPO_TOKEN && !(env as { EXPO_ACCESS_TOKEN?: string }).EXPO_ACCESS_TOKEN) {
      app.log.warn(
        "[push] EXPO_TOKEN is not set: push notification delivery is DISABLED. " +
        "Create an access token at expo.dev → Account → Access Tokens and set it as EXPO_TOKEN (or EXPO_ACCESS_TOKEN)."
      );
    }
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void start();

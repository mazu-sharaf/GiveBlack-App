/**
 * Upserts App Store review accounts (donor + charity) and links the charity to an organization.
 * Run: node apps/api/scripts/provision-review-accounts.mjs (from repo root, with DATABASE_URL)
 * Or: npm run review-accounts -w @giveblack/api
 */
import { config } from "dotenv";
import pg from "pg";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const currentDir = path.dirname(__filename);
const repoRoot = path.resolve(currentDir, "../../..");

export const REVIEW_DONOR_EMAIL = "davidchughes02@gmail.com";
export const REVIEW_CHARITY_EMAIL = "david.hughes@giveblackapp.com";
export const REVIEW_PASSWORD = "David9876";
export const REVIEW_FULL_NAME = "David Hughes";
export const REVIEW_ORG_ID = "org-app-store-review";
export const REVIEW_CHARITY_DESCRIPTION =
  "Organization profile for App Store review and testing.";

/**
 * @param {import("pg").Pool} pool
 */
export async function ensureReviewAccounts(pool) {
  const passwordHash = await bcrypt.hash(REVIEW_PASSWORD, 12);

  await pool.query(
    `
      insert into users (email, full_name, password_hash, role)
      values ($1, $2, $3, 'donor')
      on conflict (email) do update
      set full_name = excluded.full_name,
          password_hash = excluded.password_hash,
          role = excluded.role
    `,
    [REVIEW_DONOR_EMAIL, REVIEW_FULL_NAME, passwordHash]
  );

  const donorIdRes = await pool.query(`select id from users where email = $1 limit 1`, [REVIEW_DONOR_EMAIL]);
  const donorId = donorIdRes.rows[0]?.id;

  if (donorId) {
    await pool.query(
      `
        insert into profiles (id, name, email, user_type)
        values ($1, $2, $3, 'donor')
        on conflict (id) do update set
          name = excluded.name,
          email = excluded.email,
          user_type = excluded.user_type
      `,
      [donorId, REVIEW_FULL_NAME, REVIEW_DONOR_EMAIL]
    );
  }

  await pool.query(
    `
      insert into users (email, full_name, password_hash, role)
      values ($1, $2, $3, 'charity_owner')
      on conflict (email) do update
      set full_name = excluded.full_name,
          password_hash = excluded.password_hash,
          role = excluded.role
    `,
    [REVIEW_CHARITY_EMAIL, REVIEW_FULL_NAME, passwordHash]
  );

  const charityIdRes = await pool.query(`select id from users where email = $1 limit 1`, [REVIEW_CHARITY_EMAIL]);
  const charityId = charityIdRes.rows[0]?.id;

  if (charityId) {
    const reqRes = await pool.query(
      `select id from charity_requests where user_id = $1 order by created_at desc limit 1`,
      [charityId]
    );
    const reqId = reqRes.rows[0]?.id;

    if (!reqId) {
      await pool.query(
        `
          insert into charity_requests
            (user_id, charity_name, contact_name, contact_email, category, description, website, status, reviewed_at)
          values
            ($1, $2, $3, $4, $5, $6, $7, 'approved', now())
        `,
        [
          charityId,
          REVIEW_FULL_NAME,
          REVIEW_FULL_NAME,
          REVIEW_CHARITY_EMAIL,
          "other",
          REVIEW_CHARITY_DESCRIPTION,
          "https://giveblackapp.com",
        ]
      );
    } else {
      await pool.query(
        `
          update charity_requests
          set charity_name = $2,
              contact_name = $3,
              contact_email = $4,
              category = $5,
              description = $6,
              website = $7,
              status = 'approved',
              reviewed_at = now()
          where id = $1
        `,
        [
          reqId,
          REVIEW_FULL_NAME,
          REVIEW_FULL_NAME,
          REVIEW_CHARITY_EMAIL,
          "other",
          REVIEW_CHARITY_DESCRIPTION,
          "https://giveblackapp.com",
        ]
      );
    }

    await pool.query(
      `
        insert into profiles
          (id, name, email, user_type, charity_name, charity_category, charity_description, charity_url)
        values
          ($1, $2, $3, 'charity', $4, $5, $6, $7)
        on conflict (id) do update set
          name = excluded.name,
          email = excluded.email,
          user_type = excluded.user_type,
          charity_name = excluded.charity_name,
          charity_category = excluded.charity_category,
          charity_description = excluded.charity_description,
          charity_url = excluded.charity_url
      `,
      [
        charityId,
        REVIEW_FULL_NAME,
        REVIEW_CHARITY_EMAIL,
        REVIEW_FULL_NAME,
        "other",
        REVIEW_CHARITY_DESCRIPTION,
        "https://giveblackapp.com",
      ]
    );
  }

  await pool.query(
    `
      insert into organizations (id, name, description, contact_email, website)
      values ($1, $2, $3, $4, $5)
      on conflict (id) do update set
        name = excluded.name,
        description = excluded.description,
        contact_email = excluded.contact_email,
        website = excluded.website
    `,
    [
      REVIEW_ORG_ID,
      REVIEW_FULL_NAME,
      REVIEW_CHARITY_DESCRIPTION,
      REVIEW_CHARITY_EMAIL,
      "https://giveblackapp.com",
    ]
  );
}

config({ path: path.join(repoRoot, ".env") });
config();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Set it in the repo root .env");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await ensureReviewAccounts(pool);
    console.log("Review accounts provisioned:");
    console.log("  Donor:  ", REVIEW_DONOR_EMAIL);
    console.log("  Charity:", REVIEW_CHARITY_EMAIL);
    console.log("  Password (both):", REVIEW_PASSWORD);
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

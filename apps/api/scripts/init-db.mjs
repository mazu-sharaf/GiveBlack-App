import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";

const { Pool } = pg;
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../..");

config({ path: path.join(repoRoot, ".env") });
config();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required. Set it in your environment or in " + repoRoot + "/.env"
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const schemaPath = path.resolve(currentDir, "../src/db/schema.sql");
  const schema = await readFile(schemaPath, "utf8");
  await pool.query(schema);
  console.log("Schema applied.");

  const migrationsPath = path.resolve(currentDir, "../src/db/migrations.sql");
  const migrations = await readFile(migrationsPath, "utf8");
  await pool.query(migrations);
  console.log("Migrations applied.");

  const seedPath = path.resolve(currentDir, "../src/db/seed.sql");
  const seed = await readFile(seedPath, "utf8");
  await pool.query(seed);
  console.log("Seed data applied.");

  const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!adminPassword) {
    console.log("ADMIN_BOOTSTRAP_PASSWORD not set; skipping admin user creation.");
    console.log("Database initialized successfully.");
    return;
  }
  const bcrypt = await import("bcryptjs");
  const adminHash = await bcrypt.default.hash(adminPassword, 12);
  await pool.query(
    `INSERT INTO users (email, full_name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING`,
    ["admin@giveblackapp.com", "Platform Admin", adminHash, "admin"]
  );
  console.log("Admin user ensured.");

  console.log("Database initialized successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });

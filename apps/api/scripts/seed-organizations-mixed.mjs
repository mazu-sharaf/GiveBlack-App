import { config } from "dotenv";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;

function slugifyId(name) {
  // Mirrors admin: `name.toLowerCase().replace(/[^a-z0-9]+/g, "-")`
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

const __filename = fileURLToPath(import.meta.url);
const currentDir = path.dirname(__filename);
const repoRoot = path.resolve(currentDir, "../../..");

config({ path: path.join(repoRoot, ".env") });
config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Set it in the repo root .env");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run") || argv.includes("-n");

// Category: always the provided string -> matched against `categories.name`
// Insert fields -> organizations: id, name, initials, category_id, description, image_color, goal, raised
const INPUT = [
  // EDUCATION
  {
    name: "Washington Streaming Foundation",
    initials: "WSF",
    category: "Education",
    description:
      "Expands digital learning through streaming and media education tools for students.",
    goal: 18000,
    raised: 6200,
    avatarColor: "#2563EB",
  },
  {
    name: "Changing Expectations",
    initials: "CE",
    category: "Education",
    description:
      "Helps students achieve higher academic goals through mentorship and development programs.",
    goal: 12000,
    raised: 4100,
    avatarColor: "#7C3AED",
  },
  {
    name: "Black Girls Do Engineer",
    initials: "BGDE",
    category: "Education",
    description:
      "Encourages young Black girls into STEM through mentorship and engineering programs.",
    goal: 20000,
    raised: 8900,
    avatarColor: "#EC4899",
  },
  {
    name: "Positive Kids Crew",
    initials: "PKC",
    category: "Education",
    description:
      "Builds confidence and leadership in youth through educational programs.",
    goal: 10000,
    raised: 3500,
    avatarColor: "#F59E0B",
  },
  {
    name: "S.O.A.R. First",
    initials: "SOAR",
    category: "Education",
    description:
      "Provides academic support and mentorship to help students reach their full potential.",
    goal: 14000,
    raised: 5200,
    avatarColor: "#10B981",
  },

  // FASHION
  {
    name: "S’Wheaton Designs",
    initials: "SWD",
    category: "Fashion Apparel",
    description:
      "Creative fashion brand promoting culture and identity through unique design.",
    goal: 12000,
    raised: 4300,
    avatarColor: "#BE123C",
  },
  {
    name: "Proguette LLC",
    initials: "PRO",
    category: "Fashion Apparel",
    description:
      "Modern apparel brand focused on style, quality, and creative empowerment.",
    goal: 15000,
    raised: 6100,
    avatarColor: "#7C2D12",
  },

  // FOOD
  {
    name: "Eastside Roasterz",
    initials: "ER",
    category: "Food Services",
    description:
      "Community-focused coffee and food initiative supporting local growth.",
    goal: 12000,
    raised: 4800,
    avatarColor: "#92400E",
  },

  // SOCIAL
  {
    name: "Northeast Ohio Black Health Coalition",
    initials: "NOBHC",
    category: "Social",
    description:
      "Improves health outcomes through education, advocacy, and community programs.",
    goal: 20000,
    raised: 9100,
    avatarColor: "#047857",
  },
  {
    name: "Human Biology",
    initials: "HB",
    category: "Social",
    description:
      "Promotes awareness of health and wellness through education and outreach.",
    goal: 12000,
    raised: 4600,
    avatarColor: "#0EA5E9",
  },

  // ACTIVISM
  {
    name: "BLMF INC",
    initials: "BLMF",
    category: "Activism",
    description:
      "Advocates for social justice and systemic change through grassroots initiatives.",
    goal: 20000,
    raised: 9700,
    avatarColor: "#DC2626",
  },
  {
    name: "Martas Angel Inc",
    initials: "MAI",
    category: "Activism",
    description:
      "Supports vulnerable communities through advocacy and outreach programs.",
    goal: 14000,
    raised: 5200,
    avatarColor: "#F97316",
  },
  {
    name: "RadPsi.pro",
    initials: "RP",
    category: "Activism",
    description:
      "Promotes mental health awareness through advocacy and education.",
    goal: 16000,
    raised: 6800,
    avatarColor: "#7C3AED",
  },

  // OTHER
  {
    name: "Give Black",
    initials: "GB",
    category: "Other",
    description:
      "Platform connecting communities to support Black-led organizations.",
    goal: 25000,
    raised: 11200,
    avatarColor: "#111827",
  },
  {
    name: "New Generation Empowerment Group",
    initials: "NGEG",
    category: "Other",
    description:
      "Develops future leaders through mentorship and community engagement.",
    goal: 15000,
    raised: 6300,
    avatarColor: "#2563EB",
  },
  {
    name: "Ubuntu Village",
    initials: "UV",
    category: "Other",
    description:
      "Promotes unity and shared growth through collaborative community programs.",
    goal: 14000,
    raised: 5400,
    avatarColor: "#059669",
  },
  {
    name: "Yoga2Sleep",
    initials: "Y2S",
    category: "Other",
    description:
      "Promotes wellness and better sleep through guided programs.",
    goal: 11000,
    raised: 4100,
    avatarColor: "#0EA5E9",
  },
];

function groupByCategory(items) {
  const out = new Map();
  for (const item of items) {
    const key = item.category;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

async function main() {
  const byCat = groupByCategory(INPUT);

  let totalInserted = 0;

  for (const [categoryName, items] of byCat.entries()) {
    const categoryRes = await pool.query(
      "select id from categories where name = $1 limit 1",
      [categoryName]
    );
    const categoryId = categoryRes.rows[0]?.id;
    if (!categoryId) {
      throw new Error(
        `Category not found: "${categoryName}". Create it first in admin.`
      );
    }

    const ids = items.map((o) => slugifyId(o.name));
    const names = items.map((o) => o.name);
    const initials = items.map((o) => o.initials);
    const descriptions = items.map((o) => o.description);
    const goals = items.map((o) => o.goal);
    const raised = items.map((o) => o.raised);
    const avatarColors = items.map((o) => o.avatarColor);

    // Count would-inserted rows: prevent duplicates by name (+ also avoid PK collisions by id).
    const countSql = `
      with input as (
        select *
        from unnest(
          $1::text[], $2::text[], $3::text[], $4::text[],
          $5::numeric[], $6::numeric[], $7::text[]
        ) as t(id, name, initials, description, goal, raised, avatar_color)
      )
      select count(*)::int as inserted_count
      from input i
      where not exists (select 1 from organizations o where o.name = i.name)
        and not exists (select 1 from organizations o where o.id = i.id)
    `;

    const insertSql = `
      with input as (
        select *
        from unnest(
          $2::text[], $3::text[], $4::text[], $5::text[],
          $6::numeric[], $7::numeric[], $8::text[]
        ) as t(id, name, initials, description, goal, raised, avatar_color)
      )
      insert into organizations (
        id, name, initials, description, category_id, image_color, goal, raised
      )
      select
        i.id, i.name, i.initials, i.description,
        $1::text as category_id,
        i.avatar_color as image_color,
        i.goal, i.raised
      from input i
      where not exists (select 1 from organizations o where o.name = i.name)
        and not exists (select 1 from organizations o where o.id = i.id)
      returning id
    `;

    const insertParams = [
      categoryId,
      ids,
      names,
      initials,
      descriptions,
      goals,
      raised,
      avatarColors,
    ];
    const countParams = [ids, names, initials, descriptions, goals, raised, avatarColors];

    if (dryRun) {
      const res = await pool.query(countSql, countParams);
      const insertedCount = res.rows[0]?.inserted_count ?? 0;
      console.log(`[DRY RUN] Category "${categoryName}": would insert ${insertedCount}`);
      totalInserted += insertedCount;
      continue;
    }

    const res = await pool.query(insertSql, insertParams);
    const insertedCount = res.rowCount ?? 0;
    console.log(`Category "${categoryName}": inserted ${insertedCount}`);
    totalInserted += insertedCount;
  }

  if (dryRun) {
    console.log(`[DRY RUN] Total would insert: ${totalInserted}`);
  } else {
    console.log(
      `Seed success: inserted ${totalInserted} organizations across ${byCat.size} categories.`
    );
  }
}

main()
  .catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });


import { config } from "dotenv";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;

function slugifyId(name) {
  // Must match the admin UI behavior for new organizations:
  // `name.toLowerCase().replace(/[^a-z0-9]+/g, "-")`
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

const __filename = fileURLToPath(import.meta.url);
const currentDir = path.dirname(__filename);
const repoRoot = path.resolve(currentDir, "../../..");

config({ path: path.join(repoRoot, ".env") });
config();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required. Set it in .env at the repo root."
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run") || argv.includes("-n");
const replace = argv.includes("--replace") || argv.includes("-r");

const CATEGORY_NAME = "Community";

const INPUT = [
  {
    name: "Fancy Vibes",
    initials: "FV",
    category: "Community",
    description:
      "Supports community engagement through creative events, local collaborations, and initiatives that bring people together.",
    goal: 5000,
    raised: 1850,
    avatarColor: "#E11D48",
  },
  {
    name: "The Ubuntu Mission",
    initials: "UM",
    category: "Community",
    description:
      "Focused on unity and collective growth, providing outreach programs and resources to uplift underserved communities.",
    goal: 12000,
    raised: 4200,
    avatarColor: "#0284C7",
  },
  {
    name: "Diane’s Helping Hands",
    initials: "DHH",
    category: "Community",
    description:
      "Offers direct assistance to individuals and families through support services, care programs, and community aid.",
    goal: 9000,
    raised: 3100,
    avatarColor: "#F97316",
  },
  {
    name: "Traveling Seniors Transportation",
    initials: "TST",
    category: "Community",
    description:
      "Provides safe and reliable transportation services for seniors, ensuring access to essential services and independence.",
    goal: 15000,
    raised: 6700,
    avatarColor: "#0D9488",
  },
  {
    name: "Black BRAND",
    initials: "BB",
    category: "Community",
    description:
      "Strengthens Black-owned businesses through networking, mentorship, and economic development initiatives.",
    goal: 20000,
    raised: 9200,
    avatarColor: "#4338CA",
  },
  {
    name: "Direct Relief",
    initials: "DR",
    category: "Community",
    description:
      "Delivers critical resources and support to communities affected by poverty, emergencies, and health challenges.",
    goal: 25000,
    raised: 15400,
    avatarColor: "#DC2626",
  },
  {
    name: "North Park Community Development Corporation",
    initials: "NPCDC",
    category: "Community",
    description:
      "Works to revitalize neighborhoods through housing development, economic support, and community programs.",
    goal: 18000,
    raised: 7600,
    avatarColor: "#16A34A",
  },
  {
    name: "HBCU Heroes",
    initials: "HH",
    category: "Community",
    description:
      "Supports students and alumni of HBCUs through scholarships, mentorship, and community-driven initiatives.",
    goal: 14000,
    raised: 5200,
    avatarColor: "#7C3AED",
  },
  {
    name: "Positive People Network Inc.",
    initials: "PPN",
    category: "Community",
    description:
      "Builds strong support networks that promote mental wellness, positivity, and personal growth.",
    goal: 8000,
    raised: 2900,
    avatarColor: "#0891B2",
  },
  {
    name: "Workshop in Business Opportunities (WIBO)",
    initials: "WIBO",
    category: "Community",
    description:
      "Provides entrepreneurship training and resources to help individuals start and sustain successful businesses.",
    goal: 16000,
    raised: 8800,
    avatarColor: "#CA8A04",
  },
  {
    name: "The Walker African-American Museum & Research Center",
    initials: "WAAMRC",
    category: "Community",
    description:
      "Preserves African-American history and culture through exhibitions, education, and research initiatives.",
    goal: 15000,
    raised: 6100,
    avatarColor: "#7C2D12",
  },
  {
    name: "Moore Enterprises Holdings, LLC",
    initials: "MEH",
    category: "Community",
    description:
      "Supports economic growth and community advancement through business development and strategic initiatives.",
    goal: 17000,
    raised: 7300,
    avatarColor: "#111827",
  },
  {
    name: "Shop-BOB Cares",
    initials: "SBC",
    category: "Community",
    description:
      "A giving initiative focused on supporting local communities through donations, outreach, and charitable programs.",
    goal: 10000,
    raised: 4100,
    avatarColor: "#DB2777",
  },
  {
    name: "Unlimited Potential",
    initials: "UP",
    category: "Community",
    description:
      "Empowers individuals through mentorship, education, and programs designed to unlock personal and professional growth.",
    goal: 12000,
    raised: 5300,
    avatarColor: "#EA580C",
  },
  {
    name: "Stafford Boxing Club",
    initials: "SBC",
    category: "Community",
    description:
      "Provides youth mentorship and discipline through boxing training, fitness programs, and community engagement.",
    goal: 11000,
    raised: 4600,
    avatarColor: "#B91C1C",
  },
  {
    name: "Mixed Behavior Foundation",
    initials: "MBF",
    category: "Community",
    description:
      "Focuses on behavioral development and youth programs that promote positive growth and life skills.",
    goal: 9000,
    raised: 3200,
    avatarColor: "#0F766E",
  },
  {
    name: "The Black Fathers Foundation",
    initials: "BFF",
    category: "Community",
    description:
      "Strengthens families by supporting and empowering Black fathers through mentorship and community programs.",
    goal: 13000,
    raised: 5700,
    avatarColor: "#1E40AF",
  },
  {
    name: "Rhonda’s Angel Network Organization",
    initials: "RANO",
    category: "Community",
    description:
      "Provides compassionate assistance and support services to individuals and families facing hardship.",
    goal: 9500,
    raised: 3500,
    avatarColor: "#F472B6",
  },
  {
    name: "Wedding Wish by Candyland Designs",
    initials: "WWCD",
    category: "Community",
    description:
      "Helps couples in need celebrate meaningful weddings through community support and donations.",
    goal: 7000,
    raised: 2400,
    avatarColor: "#FB7185",
  },
  {
    name: "Collaborating Voices Foundation",
    initials: "CVF",
    category: "Community",
    description:
      "Brings communities together by amplifying diverse voices through collaboration and outreach initiatives.",
    goal: 10000,
    raised: 3900,
    avatarColor: "#9333EA",
  },
  {
    name: "Test Chapter",
    initials: "TC",
    category: "Community",
    description:
      "A local chapter focused on engagement, networking, and supporting community-driven initiatives.",
    goal: 5000,
    raised: 1200,
    avatarColor: "#6B7280",
  },
  {
    name: "Eden Gardens Community Association",
    initials: "EGCA",
    category: "Community",
    description:
      "Works to improve neighborhood living conditions through community programs and resident support.",
    goal: 12000,
    raised: 4800,
    avatarColor: "#15803D",
  },
  {
    name: "athletech",
    initials: "AT",
    category: "Community",
    description:
      "Supports youth and athletes through sports training, development programs, and community initiatives.",
    goal: 11000,
    raised: 4200,
    avatarColor: "#0369A1",
  },
  {
    name: "Liberated Arts Movement",
    initials: "LAM",
    category: "Community",
    description:
      "Promotes cultural expression and empowerment through arts, education, and community engagement.",
    goal: 10000,
    raised: 3700,
    avatarColor: "#A21CAF",
  },
  {
    name: "newblkwallstreet",
    initials: "NBWS",
    category: "Community",
    description:
      "Encourages economic empowerment by supporting Black-owned businesses and financial growth initiatives.",
    goal: 20000,
    raised: 9800,
    avatarColor: "#A16207",
  },
];

async function main() {
  const categoryRes = await pool.query(
    `select id from categories where name = $1 limit 1`,
    [CATEGORY_NAME]
  );
  const categoryId = categoryRes.rows[0]?.id;
  if (!categoryId) {
    throw new Error(
      `Category not found: "${CATEGORY_NAME}". Create the category first in admin.`
    );
  }

  if (replace) {
    const deleteRes = await pool.query(
      `delete from organizations where category_id = $1`,
      [categoryId]
    );
    if (dryRun) {
      // In dry-run mode we can't delete; so we re-run as a count-only query.
      const cntRes = await pool.query(
        `select count(*)::int as deleted_count from organizations where category_id = $1`,
        [categoryId]
      );
      const deletedCount = cntRes.rows[0]?.deleted_count ?? 0;
      console.log(`[DRY RUN] Would delete ${deletedCount} existing "${CATEGORY_NAME}" organizations.`);
    } else {
      const deletedCount = deleteRes.rowCount ?? 0;
      console.log(`Deleted ${deletedCount} existing "${CATEGORY_NAME}" organizations (hard delete).`);
    }
  }

  // Map input -> arrays for a single bulk query.
  const ids = INPUT.map((o) => slugifyId(o.name));
  const names = INPUT.map((o) => o.name);
  const initials = INPUT.map((o) => o.initials);
  const descriptions = INPUT.map((o) => o.description);
  const goals = INPUT.map((o) => o.goal);
  const raised = INPUT.map((o) => o.raised);
  const avatarColors = INPUT.map((o) => o.avatarColor);

  // Bulk insert only when name doesn't already exist.
  // Note: organizations table doesn't enforce uniqueness on name, so we do the check here.
  const dryRunSql = `
    with input as (
      select *
      from unnest(
        $1::text[], $2::text[], $3::text[], $4::text[],
        $5::numeric[], $6::numeric[], $7::text[]
      )
        as t(id, name, initials, description, goal, raised, avatar_color)
    )
    select count(*)::int as inserted_count
    from input i
    where not exists (select 1 from organizations o where o.name = i.name)
  `;

  const insertSql = `
    with input as (
      select *
      from unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::numeric[], $8::text[])
        as t(id, name, initials, description, goal, raised, avatar_color)
    )
    insert into organizations (
      id, name, initials, description, category_id, image_color, goal, raised
    )
    select
      i.id,
      i.name,
      i.initials,
      i.description,
      $1::text as category_id,
      i.avatar_color as image_color,
      i.goal,
      i.raised
    from input i
    where not exists (select 1 from organizations o where o.name = i.name)
    on conflict (id) do nothing
    returning id
  `;

  const params = [
    categoryId,
    ids,
    names,
    initials,
    descriptions,
    goals,
    raised,
    avatarColors,
  ];
  const dryRunParams = [ids, names, initials, descriptions, goals, raised, avatarColors];

  if (dryRun) {
    const res = await pool.query(dryRunSql, dryRunParams);
    const insertedCount = res.rows[0]?.inserted_count ?? 0;
    console.log(`[DRY RUN] Would insert ${insertedCount} organizations.`);
    return;
  }

  const res = await pool.query(insertSql, params);
  const insertedCount = res.rowCount ?? 0;
  console.log(`Seed success: inserted ${insertedCount} organizations into category "${CATEGORY_NAME}".`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });


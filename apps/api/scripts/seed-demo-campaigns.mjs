import { config } from "dotenv";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const { Pool } = pg;

function slugifyId(name) {
  // Mirrors admin UI behavior for new organizations:
  // `name.toLowerCase().replace(/[^a-z0-9]+/g, "-")`
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function hashStringToInt(input) {
  // Simple deterministic hash for seeding PRNGs.
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, maxInclusive) {
  const r = rng();
  return Math.floor(r * (maxInclusive - min + 1)) + min;
}

function randBetween(rng, min, max) {
  return min + (max - min) * rng();
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
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
const resetDemo = argv.includes("--reset-demo");
const maxCampaignsFlagIdx = argv.indexOf("--max-campaigns");
const maxCampaigns =
  maxCampaignsFlagIdx >= 0 ? Number(argv[maxCampaignsFlagIdx + 1] ?? 30) : 30;
const donationsPerCampaignFlagIdx = argv.indexOf("--donations-per-campaign");
const donationsPerCampaign =
  donationsPerCampaignFlagIdx >= 0
    ? Number(argv[donationsPerCampaignFlagIdx + 1] ?? 2)
    : 2;
const donorsCountFlagIdx = argv.indexOf("--demo-donors");
const demoDonorsCount =
  donorsCountFlagIdx >= 0 ? Number(argv[donorsCountFlagIdx + 1] ?? 5) : 5;

const campaignsPerOrgMin =
  argv.includes("--camps-min") ? Number(argv[argv.indexOf("--camps-min") + 1] ?? 2) : 2;
const campaignsPerOrgMax =
  argv.includes("--camps-max") ? Number(argv[argv.indexOf("--camps-max") + 1] ?? 5) : 5;

const DEMO_CAMPAIGN_PREFIX = "demo-camp-";
const DEMO_PI_PREFIX = "demo-pi-";

const IMAGE_BASE = "https://picsum.photos/seed";

function imageUrlFor(seed, w = 1200, h = 800) {
  return `${IMAGE_BASE}/${encodeURIComponent(seed)}/${w}/${h}`;
}

function mainImageSeed(campaignId) {
  return `${campaignId}-main`;
}

function gallerySeed(campaignId, idx) {
  return `${campaignId}-g${idx + 1}`;
}

const TITLE_TEMPLATES = [
  "Community Impact Initiative",
  "Neighborhood Outreach Program",
  "Local Growth & Support Drive",
  "Education Access Expansion",
  "Health & Wellness Community Project",
  "Youth Mentorship & Opportunity",
  "Cultural Celebration Fundraiser",
  "Sustainable Futures Initiative",
  "Support Services Community Campaign",
  "Volunteer Powered Action",
];

const DESCRIPTION_TEMPLATES = [
  "Empowering people through hands-on programs, mentorship, and community-led initiatives.",
  "Building long-term impact with transparent goals, meaningful engagement, and measurable outcomes.",
  "Reaching underserved neighbors with practical support, resources, and community collaboration.",
  "Turning generosity into real progress through targeted services and community partnerships.",
  "Supporting growth and opportunity with a focus on education, care, and sustainable development.",
];

const STORY_TEMPLATES = [
  "Every donation helps strengthen programs that meet real needs in the community.",
  "This campaign was created to bring people together and support lasting change.",
  "Your support fuels community-led efforts and expands access to essential resources.",
];

function buildDeterministicId(orgId, index) {
  // Must be stable across runs.
  return `${DEMO_CAMPAIGN_PREFIX}${slugifyId(orgId)}-${index}`;
}

function demoDonorEmail(i) {
  const fullName = demoDonorFullName(i);
  const localPart = String(fullName)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${localPart}@giveblackapp.com`;
}

const demoDonorPassword = "DemoPass123!";

const DAVID_FULL_NAME = "David Hughes";
const DAVID_DONOR_EMAIL = "david.hughes@giveblackapp.com";
const DAVID_CHARITY_EMAIL = "david.hughes.charity@giveblackapp.com";

const DEMO_DONOR_FULL_NAMES = [
  "Ava Johnson",
  "Noah Williams",
  "Sophia Martinez",
  "Liam Brown",
  "Mia Davis",
  "Ethan Wilson",
  "Charlotte Anderson",
  "Jackson Thomas",
  "Amelia Taylor",
  "Benjamin Moore",
  "Harper Jackson",
  "Elijah White",
  "Evelyn Harris",
  "William Martin",
  "Abigail Thompson",
  "James Garcia",
  "Emily Rodriguez",
  "Henry Lewis",
  "Ella Walker",
  "Alexander Hall",
  // Extra names to support larger `--demo-donors` values.
  "Grace Young",
  "Daniel King",
  "Chloe Wright",
  "Michael Lopez",
  "Victoria Hill",
  "Samuel Scott",
  "Layla Green",
  "Jack Adams",
  "Zoe Baker",
  "Owen Nelson",
  "Riley Carter",
  "Matthew Mitchell",
  "Hannah Perez",
  "David Roberts",
  "Lily Turner",
  "Joseph Phillips",
  "Aria Campbell",
  "Gabriel Parker",
  "Nora Evans",
  "Leo Edwards",
];

function demoDonorFullName(i) {
  const idx = i % DEMO_DONOR_FULL_NAMES.length;
  return DEMO_DONOR_FULL_NAMES[idx];
}

async function ensureDavidAccounts(passwordHash) {
  // Donor David
  await pool.query(
    `
      insert into users (email, full_name, password_hash, role)
      values ($1, $2, $3, 'donor')
      on conflict (email) do update
      set full_name = excluded.full_name,
          password_hash = excluded.password_hash,
          role = excluded.role
    `,
    [DAVID_DONOR_EMAIL, DAVID_FULL_NAME, passwordHash]
  );

  const donorIdRes = await pool.query(`select id from users where email = $1 limit 1`, [DAVID_DONOR_EMAIL]);
  const donorId = donorIdRes.rows[0]?.id;

  if (donorId) {
    // Not required for login (type falls back to donor), but helps keep profile consistent.
    await pool.query(
      `
        insert into profiles (id, name, email, user_type)
        values ($1, $2, $3, 'donor')
        on conflict (id) do update set
          name = excluded.name,
          email = excluded.email,
          user_type = excluded.user_type
      `,
      [donorId, DAVID_FULL_NAME, DAVID_DONOR_EMAIL]
    );
  }

  // Charity David (charity_owner)
  await pool.query(
    `
      insert into users (email, full_name, password_hash, role)
      values ($1, $2, $3, 'charity_owner')
      on conflict (email) do update
      set full_name = excluded.full_name,
          password_hash = excluded.password_hash,
          role = excluded.role
    `,
    [DAVID_CHARITY_EMAIL, DAVID_FULL_NAME, passwordHash]
  );

  const charityIdRes = await pool.query(`select id from users where email = $1 limit 1`, [DAVID_CHARITY_EMAIL]);
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
            (user_id, charity_name, contact_name, contact_email, category, description, website, status)
          values
            ($1, $2, $3, $4, $5, $6, $7, 'approved')
        `,
        [
          charityId,
          DAVID_FULL_NAME,
          DAVID_FULL_NAME,
          DAVID_CHARITY_EMAIL,
          "other",
          "Demo charity account for testing login and impact screens.",
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
          DAVID_FULL_NAME,
          DAVID_FULL_NAME,
          DAVID_CHARITY_EMAIL,
          "other",
          "Demo charity account for testing login and impact screens.",
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
        DAVID_FULL_NAME,
        DAVID_CHARITY_EMAIL,
        DAVID_FULL_NAME,
        "other",
        "Demo charity account for testing login and impact screens.",
        "https://giveblackapp.com",
      ]
    );
  }
}

async function getOldDemoOrgTotals() {
  const res = await pool.query(
    `
      select org_id,
             coalesce(sum(amount), 0)::numeric as raised,
             count(*)::int as donor_count
      from donations
      where status = 'succeeded'
        and campaign_id like $1
      group by org_id
    `,
    [`${DEMO_CAMPAIGN_PREFIX}%`]
  );
  const map = new Map();
  for (const row of res.rows) {
    map.set(row.org_id, {
      raised: Number(row.raised ?? 0),
      donor_count: Number(row.donor_count ?? 0),
    });
  }
  return map;
}

async function main() {
  if (maxCampaigns < 1) throw new Error("--max-campaigns must be >= 1");
  if (donationsPerCampaign < 1) throw new Error("--donations-per-campaign must be >= 1");

  // Capture old demo totals (so we can apply delta to organizations + keep reruns safe).
  const oldOrgTotals = await getOldDemoOrgTotals();

  if (resetDemo) {
    // When we reset demo campaigns, also remove donor_stats from any users
    // that previously donated to demo campaigns (so old "demo" donors don't
    // keep showing in the leaderboard).
    const prevDemoDonorsRes = await pool.query(
      `
        select distinct d.user_id
        from donations d
        join campaigns c on c.id = d.campaign_id
        where c.id like $1
          and d.status = 'succeeded'
          and d.user_id is not null
      `,
      [`${DEMO_CAMPAIGN_PREFIX}%`]
    );
    const prevDemoDonorIds = prevDemoDonorsRes.rows.map((r) => r.user_id).filter(Boolean);

    // Campaign deletion cascades to campaign_images and donations.
    await pool.query("delete from campaigns where id like $1", [`${DEMO_CAMPAIGN_PREFIX}%`]);

    if (prevDemoDonorIds.length > 0) {
      await pool.query("delete from donor_stats where user_id = any($1::uuid[])", [prevDemoDonorIds]);
    }
  }

  // Fetch organizations to generate demo campaigns for.
  const orgRes = await pool.query(
    `
      select id, name, goal, raised, category_id, image_color, initials
      from organizations
      where archived_at is null
      order by created_at desc
      limit 200
    `
  );
  const orgs = orgRes.rows;
  if (!orgs.length) throw new Error("No organizations found to seed demo campaigns.");

  // Create / ensure demo donor users.
  const demoDonorEmails = Array.from({ length: demoDonorsCount }, (_, i) => demoDonorEmail(i));

  const passwordHash = await bcrypt.hash(demoDonorPassword, 12);

  // Ensure David accounts exist for the client demo login buttons.
  await ensureDavidAccounts(passwordHash);

  for (let i = 0; i < demoDonorEmails.length; i++) {
    const email = demoDonorEmails[i];
    const fullName = demoDonorFullName(i);
    await pool.query(
      `
        insert into users (email, full_name, password_hash, role)
        values ($1, $2, $3, 'donor')
        on conflict (email) do update
        set full_name = excluded.full_name,
            password_hash = excluded.password_hash,
            role = excluded.role
      `,
      [email, fullName, passwordHash]
    );
  }

  const donorUsersRes = await pool.query(
    `
      select id, email, full_name
      from users
      where email = any($1::text[])
    `,
    [demoDonorEmails]
  );
  const demoDonorUsers = donorUsersRes.rows;
  if (demoDonorUsers.length === 0) throw new Error("Failed to create/find demo donor users.");

  // Decide which demo campaigns to create (with an overall cap).
  const maxTotal = maxCampaigns;
  const demoCampaignsToCreate = [];
  let remaining = maxTotal;

  for (let orgIndex = 0; orgIndex < orgs.length && remaining > 0; orgIndex++) {
    const org = orgs[orgIndex];
    const rng = mulberry32(hashStringToInt(String(org.id)));
    const desired = randInt(rng, campaignsPerOrgMin, campaignsPerOrgMax);
    const countForOrg = clamp(desired, 0, remaining);
    for (let i = 0; i < countForOrg; i++) {
      demoCampaignsToCreate.push({ org, index: i });
    }
    remaining -= countForOrg;
  }

  // Insert demo campaigns + images.
  for (const item of demoCampaignsToCreate) {
    const { org, index } = item;
    const campaignId = buildDeterministicId(org.id, index + (slugifyId(org.id).length % 7));
    // Above keeps IDs stable even if index generation changes slightly; it's still deterministic.
    const rng = mulberry32(hashStringToInt(`${org.id}:${index}:${campaignId}`));

    const title = TITLE_TEMPLATES[randInt(rng, 0, TITLE_TEMPLATES.length - 1)] + ` — ${org.name}`;
    const description = DESCRIPTION_TEMPLATES[randInt(rng, 0, DESCRIPTION_TEMPLATES.length - 1)];
    const story = STORY_TEMPLATES[randInt(rng, 0, STORY_TEMPLATES.length - 1)];
    const goal = Math.max(1000, Math.round(Number(org.goal || 10000) * randBetween(rng, 0.05, 0.25)));

    const mainImageUrl = imageUrlFor(mainImageSeed(campaignId));
    const location = "United States";

    await pool.query(
      `
        insert into campaigns (id, organization_id, title, description, story, about, location, goal, raised, donor_count, status, main_image_url, created_at, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 'active', $9, now(), now())
        on conflict (id) do nothing
      `,
      [campaignId, org.id, title, description, story, description, location, goal, mainImageUrl]
    );

    // 3 gallery images
    for (let g = 0; g < 3; g++) {
      const imgId = `cimg-${campaignId}-${g}`;
      const imageUrl = imageUrlFor(gallerySeed(campaignId, g));
      const caption = `Gallery ${g + 1}`;
      const sortOrder = g;
      await pool.query(
        `
          insert into campaign_images (id, campaign_id, org_id, image_url, caption, sort_order)
          values ($1, $2, $3, $4, $5, $6)
          on conflict (id) do nothing
        `,
        [imgId, campaignId, org.id, imageUrl, caption, sortOrder]
      );
    }
  }

  // Insert demo donations (succeeded).
  const donationsToInsert = [];
  for (const item of demoCampaignsToCreate) {
    const { org, index } = item;
    const campaignId = buildDeterministicId(org.id, index + (slugifyId(org.id).length % 7));
    const rng = mulberry32(hashStringToInt(`${campaignId}:donations`));

    const goalRes = await pool.query(
      "select goal from campaigns where id = $1 limit 1",
      [campaignId]
    );
    const goalRow = goalRes.rows[0] || {};
    const campaignGoal = Number(goalRow.goal || 10000);

    // Pick a total raised fraction so the progress bar looks good.
    const targetRaised = campaignGoal * randBetween(rng, 0.2, 0.9);
    const weights = [];
    for (let k = 0; k < donationsPerCampaign; k++) {
      weights.push(randBetween(rng, 0.3, 1.2));
    }
    const sumW = weights.reduce((a, b) => a + b, 0) || 1;

    // Pick donors in a deterministic round-robin order so the leaderboard has
    // many distinct donors (helps when you want to display top 20).
    const donorsPicked = [];
    const startIdx = hashStringToInt(campaignId) % demoDonorUsers.length;
    for (let k = 0; k < donationsPerCampaign; k++) {
      const donorUser = demoDonorUsers[(startIdx + index + k) % demoDonorUsers.length];
      donorsPicked.push(donorUser);
    }

    const amounts = [];
    for (let k = 0; k < donationsPerCampaign; k++) {
      const portion = (weights[k] / sumW) * targetRaised;
      // Use integer-ish amounts so UI shows clean numbers.
      const amt = Math.max(5, Math.round(portion));
      amounts.push(amt);
    }

    for (let k = 0; k < donationsPerCampaign; k++) {
      const donor = donorsPicked[k];
      const amount = amounts[k];
      const stripePaymentIntentId = `${DEMO_PI_PREFIX}${campaignId}-${k}`;
      donationsToInsert.push({
        orgId: org.id,
        campaignId,
        userId: donor.id,
        amount,
        currency: "usd",
        stripePaymentIntentId,
        donorName: donor.full_name || donor.email.split("@")[0],
        donorEmail: donor.email,
      });
    }
  }

  // Insert donations in a loop (still small volume due to maxCampaigns cap).
  for (const d of donationsToInsert) {
    await pool.query(
      `
        insert into donations (
          org_id, campaign_id, user_id, amount, currency, status,
          stripe_payment_intent_id, donor_name, donor_email, message, is_anonymous, paid_at, created_at
        )
        values (
          $1, $2, $3, $4, $5, 'succeeded',
          $6, $7, $8, $9, false, now(), now()
        )
        on conflict (stripe_payment_intent_id) do nothing
      `,
      [
        d.orgId,
        d.campaignId,
        d.userId,
        d.amount,
        d.currency,
        d.stripePaymentIntentId,
        d.donorName,
        d.donorEmail,
        "Demo donation",
      ]
    );
  }

  // Update campaign totals for demo campaigns.
  await pool.query(
    `
      with totals as (
        select c.id as campaign_id,
               coalesce(sum(d.amount), 0)::numeric as raised,
               count(d.id)::int as donor_count
        from campaigns c
        left join donations d
          on d.campaign_id = c.id
         and d.status = 'succeeded'
        where c.id like $1
        group by c.id
      )
      update campaigns c
      set raised = t.raised,
          donor_count = t.donor_count,
          updated_at = now()
      from totals t
      where c.id = t.campaign_id
    `,
    [`${DEMO_CAMPAIGN_PREFIX}%`]
  );

  // Update organization totals: apply delta between old and new demo donation totals.
  const newOrgTotals = await getOldDemoOrgTotals();
  const allOrgIds = new Set([...oldOrgTotals.keys(), ...newOrgTotals.keys()]);
  for (const orgId of allOrgIds) {
    const oldT = oldOrgTotals.get(orgId) || { raised: 0, donor_count: 0 };
    const newT = newOrgTotals.get(orgId) || { raised: 0, donor_count: 0 };
    const deltaRaised = newT.raised - oldT.raised;
    const deltaDonors = newT.donor_count - oldT.donor_count;

    if (deltaRaised === 0 && deltaDonors === 0) continue;

    await pool.query(
      `
        update organizations
        set raised = raised + $1,
            donor_count = donor_count + $2
        where id = $3
      `,
      [deltaRaised, deltaDonors, orgId]
    );
  }

  // Recompute donor_stats for demo donors only.
  const demoDonorIds = demoDonorUsers.map((u) => u.id);
  if (demoDonorIds.length) {
    await pool.query("delete from donor_stats where user_id = any($1::uuid[])", [demoDonorIds]);

    await pool.query(
      `
        insert into donor_stats (user_id, total_amount_cents, donation_count, first_donation_at, last_donation_at)
        select
          d.user_id,
          (sum(d.amount * 100)::bigint) as total_amount_cents,
          count(*)::int as donation_count,
          min(d.created_at) as first_donation_at,
          max(d.created_at) as last_donation_at
        from donations d
        where d.status = 'succeeded'
          and d.user_id = any($1::uuid[])
          and d.campaign_id like $2
        group by d.user_id
      `,
      [demoDonorIds, `${DEMO_CAMPAIGN_PREFIX}%`]
    );
  }

  // Print primary demo donor credentials for login.
  const primaryEmail = demoDonorEmails[0];
  // eslint-disable-next-line no-console
  console.log("=== Demo seed complete ===");
  console.log(`Sample donor login: ${primaryEmail}`);
  console.log(`Password: ${demoDonorPassword}`);
  console.log(`Seeded up to ${demoCampaignsToCreate.length} demo campaigns (cap: ${maxCampaigns}).`);
  console.log(`Inserted/ensured demo donors: ${demoDonorUsers.length}`);
  console.log(`Donations per campaign: ${donationsPerCampaign}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });


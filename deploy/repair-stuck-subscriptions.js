require("dotenv").config();
const { Client } = require("pg");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const client = new Client({ connectionString: process.env.DATABASE_URL });

function tierFromProduct(productId) {
  if (productId === process.env.STRIPE_PRODUCT_GROWTH) return "growth";
  if (productId === process.env.STRIPE_PRODUCT_INSTITUTIONAL) return "institutional";
  return "free";
}

function tierForStatus(status, paidTier) {
  if (["active", "trialing", "past_due", "unpaid", "incomplete"].includes(status)) return paidTier;
  if (["canceled", "incomplete_expired"].includes(status)) return "free";
  return paidTier;
}

async function run() {
  await client.connect();
  try {
    const sql = `
      select org_id, stripe_subscription_id
      from org_subscriptions
      where stripe_subscription_id is not null
        and tier = 'free'
        and status in ('incomplete', 'past_due', 'unpaid')
      order by updated_at desc nulls last, created_at desc
    `;
    const q = await client.query(sql);
    console.log(`Candidates: ${q.rowCount}`);

    let updated = 0;
    for (const row of q.rows) {
      const orgId = row.org_id;
      const subscriptionId = row.stripe_subscription_id;
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const productId = sub.items?.data?.[0]?.price?.product || null;
        const resolvedTier = sub.metadata?.tier || tierFromProduct(productId);
        const status = String(sub.status || "incomplete");
        const nextTier = tierForStatus(status, resolvedTier || "free");
        const customerId = typeof sub.customer === "string" ? sub.customer : null;
        const periodStart = sub.current_period_start
          ? new Date(sub.current_period_start * 1000).toISOString()
          : null;
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;
        const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
        const canceledAt = sub.canceled_at
          ? new Date(sub.canceled_at * 1000).toISOString()
          : null;

        await client.query(
          `insert into org_subscriptions
            (org_id, tier, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end, canceled_at, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
           on conflict (stripe_subscription_id) do update set
             tier = excluded.tier,
             status = excluded.status,
             stripe_customer_id = excluded.stripe_customer_id,
             current_period_start = excluded.current_period_start,
             current_period_end = excluded.current_period_end,
             cancel_at_period_end = excluded.cancel_at_period_end,
             canceled_at = excluded.canceled_at,
             updated_at = now()`,
          [orgId, nextTier, status, customerId, subscriptionId, periodStart, periodEnd, cancelAtPeriodEnd, canceledAt]
        );

        updated += 1;
        console.log(`Updated ${orgId} -> tier=${nextTier}, status=${status}`);
      } catch (err) {
        console.log(`Skip ${orgId}/${subscriptionId}: ${err.message}`);
      }
    }

    console.log(`Done. Updated rows: ${updated}`);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

require("dotenv").config();
const { Client } = require("pg");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const db = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await db.connect();
  try {
    // Get the current subscription row
    const res = await db.query(
      "select org_id, tier, status, stripe_subscription_id from org_subscriptions where org_id = 'org-zotac-1c6ad49e'"
    );
    console.log("DB row:", JSON.stringify(res.rows, null, 2));

    const row = res.rows[0];
    if (!row || !row.stripe_subscription_id) {
      console.log("No subscription found");
      return;
    }

    // Fetch from Stripe with payment intent expanded
    const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, {
      expand: ["latest_invoice.payment_intent"],
    });
    console.log("Stripe status:", sub.status);
    console.log("Stripe cancel_at_period_end:", sub.cancel_at_period_end);
    
    const invoice = sub.latest_invoice;
    const pi = invoice?.payment_intent;
    console.log("Payment intent status:", pi?.status);
    console.log("Period end:", sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null);

    // Determine effective status
    let effectiveStatus = sub.status;
    if (effectiveStatus === "incomplete" && (pi?.status === "succeeded" || pi?.status === "processing")) {
      effectiveStatus = "active";
      console.log("Overriding status to active (payment confirmed)");
    }

    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
    const periodStart = sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null;

    // Update DB
    await db.query(
      `UPDATE org_subscriptions SET 
        status = $1,
        tier = $2,
        current_period_start = $3,
        current_period_end = $4,
        cancel_at_period_end = $5,
        updated_at = now()
       WHERE org_id = 'org-zotac-1c6ad49e'`,
      [effectiveStatus, "growth", periodStart, periodEnd, sub.cancel_at_period_end]
    );
    console.log("Updated DB: status=" + effectiveStatus + ", tier=growth, period_end=" + periodEnd);
  } finally {
    await db.end();
  }
}

run().catch(console.error);

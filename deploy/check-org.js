require("dotenv").config();
const { Client } = require("pg");
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(async () => {
  // Check all orgs and their subscriptions
  const orgs = await c.query("select id, name, contact_email from organizations limit 20");
  console.log("ORGANIZATIONS:", JSON.stringify(orgs.rows, null, 2));

  const subs = await c.query("select org_id, tier, status, stripe_subscription_id from org_subscriptions order by updated_at desc nulls last limit 10");
  console.log("SUBSCRIPTIONS:", JSON.stringify(subs.rows, null, 2));

  const users = await c.query("select id, email, role from users limit 10");
  console.log("USERS:", JSON.stringify(users.rows, null, 2));
  c.end();
}).catch(e => { console.error(e.message); c.end(); });

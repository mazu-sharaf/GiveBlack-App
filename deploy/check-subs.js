require("dotenv").config();
const { Client } = require("pg");
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect()
  .then(() => c.query("select org_id, tier, status, stripe_subscription_id, current_period_end, updated_at from org_subscriptions order by updated_at desc nulls last limit 10"))
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); c.end(); })
  .catch(e => { console.error(e.message); c.end(); });

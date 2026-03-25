require("dotenv").config();
const { Client } = require("pg");
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(async () => {
  const reqs = await c.query(
    "select id, user_id, charity_name, contact_email, status from charity_requests where status = 'approved' or user_id in (select id from users where role = 'charity_owner') limit 20"
  );
  console.log("CHARITY_REQUESTS:", JSON.stringify(reqs.rows, null, 2));

  const orgs = await c.query("select id, name, contact_email from organizations where id like 'org-%' limit 20");
  console.log("ORG-PREFIXED ORGS:", JSON.stringify(orgs.rows, null, 2));

  // Count all orgs
  const cnt = await c.query("select count(*) from organizations");
  console.log("TOTAL ORGS:", cnt.rows[0].count);
  c.end();
}).catch(e => { console.error(e.message); c.end(); });

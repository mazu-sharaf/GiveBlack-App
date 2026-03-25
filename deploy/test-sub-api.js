require("dotenv").config();
const http = require("http");
const jwt = require("jsonwebtoken");
const { Client } = require("pg");

async function get(path, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "localhost",
      port: 5001,
      path,
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function run() {
  // Mint a token directly using the JWT secret
  const userId = "75298616-d1b0-48ac-a577-44ac84f45500"; // mashhood8168@gmail.com
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) { console.error("No JWT_ACCESS_SECRET in env"); return; }

  const token = jwt.sign({ sub: userId, email: "mashhood8168@gmail.com", role: "charity_owner" }, secret, { expiresIn: "1h" });

  const sub = await get("/api/charity/my-subscription", token);
  console.log("SUBSCRIPTION:", sub.status, JSON.stringify(sub.body, null, 2));
}

run().catch(console.error);

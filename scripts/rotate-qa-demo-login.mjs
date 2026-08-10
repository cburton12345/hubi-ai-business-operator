import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(".env.local");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const email = "qa-demo@ferocity.live";
const password = `${crypto.randomBytes(18).toString("base64url")}!9Qa`;
const iterations = 120000;
const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

await client.connect();
try {
  const user = await client.query("select id from public.users where email=$1 limit 1", [email]);
  if (!user.rows[0]) throw new Error("QA demo user was not found.");
  await client.query(
    `insert into public.user_password_credentials
       (user_id, password_hash, password_salt, password_iterations, must_reset_password)
     values ($1,$2,$3,$4,false)
     on conflict (user_id) do update set
       password_hash=excluded.password_hash,
       password_salt=excluded.password_salt,
       password_iterations=excluded.password_iterations,
       must_reset_password=false,
       updated_at=now()`,
    [user.rows[0].id, hash, salt, iterations]
  );
  let envText = fs.readFileSync(".env.local", "utf8");
  const line = `QA_DEMO_PASSWORD=${password}`;
  envText = /^QA_DEMO_PASSWORD=.*$/m.test(envText)
    ? envText.replace(/^QA_DEMO_PASSWORD=.*$/m, line)
    : `${envText.trimEnd()}\n${line}\n`;
  fs.writeFileSync(".env.local", envText);
  console.log(JSON.stringify({ rotated: true, email, passwordStoredInIgnoredEnv: true }, null, 2));
} finally {
  await client.end();
}

import pg from "pg";
import fs from "node:fs";

const { Client } = pg;

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const tenantId = process.env.TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const requestedAuthUserId = process.env.ADMIN_AUTH_USER_ID ?? "33333333-3333-4333-8333-333333333333";
const outsiderAuthUserId = "44444444-4444-4444-8444-444444444444";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

await client.connect();

try {
  let email = process.env.ADMIN_EMAIL;

  if (!email) {
    const holder = await client.query(
      `
      select email
      from public.users
      where auth_user_id = $1
      limit 1
      `,
      [requestedAuthUserId]
    );

    email = holder.rows[0]?.email;
  }

  if (!email) {
    throw new Error("ADMIN_EMAIL is required, or ADMIN_AUTH_USER_ID must already belong to a user.");
  }

  const adminUser = await client.query(
    `
    select id, email, auth_user_id
    from public.users
    where lower(email) = lower($1)
    limit 1
    `,
    [email]
  );

  if (adminUser.rowCount !== 1) {
    throw new Error(`No user found for ADMIN_EMAIL=${email}. Run db:bootstrap-admin first.`);
  }

  let authUserId = adminUser.rows[0].auth_user_id;

  if (!authUserId) {
    const holder = await client.query(
      `
      select email
      from public.users
      where auth_user_id = $1
      limit 1
      `,
      [requestedAuthUserId]
    );

    if (holder.rowCount && holder.rows[0].email.toLowerCase() !== email.toLowerCase()) {
      throw new Error(
        `ADMIN_AUTH_USER_ID is already attached to ${holder.rows[0].email}. ` +
          "Set ADMIN_AUTH_USER_ID to the Supabase auth user id for ADMIN_EMAIL, or clear the duplicate test id."
      );
    }

    await client.query(
      `
      update public.users
      set auth_user_id = $1, updated_at = now()
      where id = $2
      `,
      [requestedAuthUserId, adminUser.rows[0].id]
    );

    authUserId = requestedAuthUserId;
  }

  await client.query("begin");
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [authUserId]);
  const allowed = await client.query("select slug from public.tenants where id = $1", [tenantId]);
  await client.query("commit");

  await client.query("begin");
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [outsiderAuthUserId]);
  const blocked = await client.query("select slug from public.tenants where id = $1", [tenantId]);
  await client.query("commit");

  if (allowed.rowCount !== 1) {
    throw new Error("Expected tenant owner to read the internal tenant through RLS.");
  }

  if (blocked.rowCount !== 0) {
    throw new Error("Expected unrelated auth user to be blocked by tenant RLS.");
  }

  console.log("RLS verification passed");
} catch (error) {
  try {
    await client.query("rollback");
  } catch {}
  throw error;
} finally {
  await client.end();
}

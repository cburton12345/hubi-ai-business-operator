import pg from "pg";

const { Client } = pg;

const tenantId = process.env.TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const email = process.env.ADMIN_EMAIL;
const authUserId = process.env.ADMIN_AUTH_USER_ID ?? "33333333-3333-4333-8333-333333333333";
const outsiderAuthUserId = "44444444-4444-4444-8444-444444444444";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (!email) {
  console.error("ADMIN_EMAIL is required.");
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
  await client.query(
    `
    update public.users
    set auth_user_id = $1, updated_at = now()
    where email = $2
    `,
    [authUserId, email]
  );

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

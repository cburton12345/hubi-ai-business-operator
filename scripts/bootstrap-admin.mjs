import pg from "pg";

const { Client } = pg;

const tenantId = process.env.TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const email = process.env.ADMIN_EMAIL;
const name = process.env.ADMIN_NAME ?? "Platform Owner";
const authUserId = process.env.ADMIN_AUTH_USER_ID || null;

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
  await client.query("begin");

  const userResult = await client.query(
    `
    insert into public.users (email, name, platform_role, auth_user_id)
    values ($1, $2, 'super_admin', $3)
    on conflict (email) do update
    set
      name = excluded.name,
      platform_role = 'super_admin',
      auth_user_id = coalesce(excluded.auth_user_id, public.users.auth_user_id),
      updated_at = now()
    returning id
    `,
    [email, name, authUserId]
  );

  const userId = userResult.rows[0].id;

  await client.query(
    `
    update public.tenants
    set owner_user_id = $1, updated_at = now()
    where id = $2
    `,
    [userId, tenantId]
  );

  await client.query(
    `
    insert into public.tenant_users (tenant_id, user_id, role, status)
    values ($1, $2, 'owner', 'active')
    on conflict (tenant_id, user_id) do update
    set role = 'owner', status = 'active', updated_at = now()
    `,
    [tenantId, userId]
  );

  await client.query("commit");
  console.log(`bootstrapped admin ${email}`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

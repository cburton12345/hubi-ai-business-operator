type ResetClient = {
  query<T = Record<string,unknown>>(sql: string,values?: unknown[]): Promise<{ rows: T[];rowCount: number | null }>;
};

export async function issueLocalPasswordReset(client: ResetClient,input: {
  tenantId: string;userId: string;tokenHash: string;language: "en" | "es";
}) {
  const credential = await client.query<{ user_id: string }>(
    `select user_id from public.user_password_credentials where user_id=$1 for update`,
    [input.userId]
  );
  if (credential.rowCount !== 1 || credential.rows[0]?.user_id !== input.userId) {
    throw new Error("Existing password credential was not available for reset issuance.");
  }
  await client.query(
    `update public.password_reset_tokens set status='revoked',revoked_at=now()
     where user_id=$1 and status='pending'`,
    [input.userId]
  );
  const inserted = await client.query<{ token_hash: string }>(
    `insert into public.password_reset_tokens(tenant_id,user_id,token_hash,status,language,expires_at)
     values($1,$2,$3,'pending',$4,now()+interval '1 hour') returning token_hash`,
    [input.tenantId,input.userId,input.tokenHash,input.language]
  );
  if (inserted.rowCount !== 1 || inserted.rows[0]?.token_hash !== input.tokenHash) {
    throw new Error("Password reset token was not persisted.");
  }
}

export async function consumeLocalPasswordReset(client: ResetClient,input: {
  tokenHash: string;passwordHash: string;passwordSalt: string;passwordIterations: number;
}) {
  const locked = await client.query<{ id: string;user_id: string }>(
    `select id,user_id from public.password_reset_tokens
     where token_hash=$1 and status='pending' and expires_at>now()`,
    [input.tokenHash]
  );
  const candidate = locked.rows[0];
  if (!candidate) return { outcome: "invalid" as const };
  const credentialLock = await client.query<{ user_id: string }>(
    `select user_id from public.user_password_credentials where user_id=$1 for update`,
    [candidate.user_id]
  );
  if (credentialLock.rowCount !== 1) throw new Error("Existing password credential was not available for reset consumption.");
  const current = await client.query<{ id: string;user_id: string }>(
    `select id,user_id from public.password_reset_tokens
     where id=$1 and user_id=$2 and status='pending' and expires_at>now()
     for update`,
    [candidate.id,candidate.user_id]
  );
  const reset = current.rows[0];
  if (!reset) return { outcome: "invalid" as const };
  const credential = await client.query(
    `update public.user_password_credentials
     set password_hash=$2,password_salt=$3,password_iterations=$4,must_reset_password=false,updated_at=now()
     where user_id=$1`,
    [reset.user_id,input.passwordHash,input.passwordSalt,input.passwordIterations]
  );
  if (credential.rowCount !== 1) throw new Error("Existing password credential was not updated.");
  const consumed = await client.query(
    `update public.password_reset_tokens set status='consumed',consumed_at=now()
     where id=$1 and status='pending'`,
    [reset.id]
  );
  if (consumed.rowCount !== 1) throw new Error("Password reset token was not consumed.");
  await client.query(
    `update public.password_reset_tokens set status='revoked',revoked_at=now()
     where user_id=$1 and id<>$2 and status='pending'`,
    [reset.user_id,reset.id]
  );
  return { outcome: "updated" as const,userId: reset.user_id };
}

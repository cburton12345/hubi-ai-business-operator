import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";

if (fs.existsSync(".env.local")) {
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function keyFrom(value, name) {
  if (value.length < 32) throw new Error(`${name} must contain at least 32 characters.`);
  return crypto.createHash("sha256").update(value).digest();
}

function decrypt(row, keys) {
  for (const key of keys) {
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(row.encryption_iv, "base64"));
      decipher.setAuthTag(Buffer.from(row.encryption_tag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(row.encrypted_secret, "base64")),
        decipher.final()
      ]).toString("utf8");
    } catch {
      // Try the next permitted rotation key.
    }
  }
  return null;
}

function encrypt(secret, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    encryptedSecret: encrypted.toString("base64"),
    encryptionIv: iv.toString("base64"),
    encryptionTag: cipher.getAuthTag().toString("base64")
  };
}

const databaseUrl = required("DATABASE_URL");
const currentRaw = required("CREDENTIAL_ENCRYPTION_KEY");
const previousRaw = required("CREDENTIAL_ENCRYPTION_KEY_PREVIOUS");
if (currentRaw === previousRaw) throw new Error("The current and previous credential-vault keys must differ.");

const currentKey = keyFrom(currentRaw, "CREDENTIAL_ENCRYPTION_KEY");
const previousKey = keyFrom(previousRaw, "CREDENTIAL_ENCRYPTION_KEY_PREVIOUS");
const commit = process.env.CONFIRM_CREDENTIAL_VAULT_ROTATION === "YES";
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("begin");
  const records = await client.query(`
    select id, provider_key, encrypted_secret, encryption_iv, encryption_tag
    from public.tenant_provider_credentials
    where encrypted_secret is not null
    order by id
    for update
  `);

  let rotated = 0;
  for (const row of records.rows) {
    const plain = decrypt(row, [currentKey, previousKey]);
    if (plain === null) throw new Error(`Credential ${row.id} could not be decrypted with either permitted key.`);
    const replacement = encrypt(plain, currentKey);
    if (decrypt({
      encrypted_secret: replacement.encryptedSecret,
      encryption_iv: replacement.encryptionIv,
      encryption_tag: replacement.encryptionTag
    }, [currentKey]) !== plain) {
      throw new Error(`Credential ${row.id} failed post-encryption verification.`);
    }

    await client.query(`
      update public.tenant_provider_credentials
      set encrypted_secret=$2, encryption_iv=$3, encryption_tag=$4,
          encryption_version='aes-256-gcm:v2',
          metadata_json=metadata_json || jsonb_build_object('keyRotatedAt', now()),
          updated_at=now()
      where id=$1
    `, [row.id, replacement.encryptedSecret, replacement.encryptionIv, replacement.encryptionTag]);
    rotated += 1;
  }

  if (commit) await client.query("commit");
  else await client.query("rollback");
  console.log(JSON.stringify({ mode: commit ? "committed" : "dry_run", recordsChecked: records.rowCount, recordsRotated: rotated }));
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}

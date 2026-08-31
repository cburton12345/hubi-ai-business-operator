import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

if (fs.existsSync(".env.local")) {
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

const publish = process.argv.includes("--publish");
const versionName = "1.0.1";
const versionCode = 2;
const artifactPath = path.resolve("output", `Ferocity-Connect-${versionName}-production-signed.apk`);
const expectedSha256 = "6A4FD1FD52ADA1D4E6461001FAB4374C290657E5958B0A83FCE171B24A3FFDD4";
const bucket = "ferocity-connect-releases";
const storagePath = `android/${versionCode}/Ferocity-Connect-${versionName}.apk`;

for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"]) {
  if (!process.env[key]) throw new Error(`${key} is required.`);
}
if (!fs.existsSync(artifactPath)) throw new Error(`Signed APK not found: ${artifactPath}`);

const bytes = fs.readFileSync(artifactPath);
const sha256 = createHash("sha256").update(bytes).digest("hex").toUpperCase();
if (sha256 !== expectedSha256) throw new Error(`APK SHA-256 mismatch. Expected ${expectedSha256}, received ${sha256}.`);

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, bytes, {
  contentType: "application/vnd.android.package-archive",
  cacheControl: "3600",
  upsert: true
});
if (uploadError) throw uploadError;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  if (publish) {
    await client.query("update public.ferocity_connect_releases set status='retired',updated_at=now() where status='published' and version_code<>$1", [versionCode]);
  }
  await client.query(
    `insert into public.ferocity_connect_releases
       (version_name,version_code,storage_bucket,storage_path,sha256,file_size_bytes,status,published_at,release_notes,updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,case when $7='published' then now() else null end,$8,now())
     on conflict (version_code) do update set
       version_name=excluded.version_name,storage_bucket=excluded.storage_bucket,storage_path=excluded.storage_path,
       sha256=excluded.sha256,file_size_bytes=excluded.file_size_bytes,status=excluded.status,
       published_at=excluded.published_at,release_notes=excluded.release_notes,updated_at=now()`,
    [versionName, versionCode, bucket, storagePath, sha256, bytes.length, publish ? "published" : "draft", "Initial production-signed Ferocity Connect release."]
  );
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

console.log(JSON.stringify({ uploaded: true, published: publish, versionName, versionCode, sha256, bytes: bytes.length, storagePath }, null, 2));


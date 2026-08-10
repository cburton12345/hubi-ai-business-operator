import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function loadLocalEnv() {
  if (!fs.existsSync(".env.local")) return;
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

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

loadLocalEnv();
const apiKey = process.env.VIDEO_API_KEY?.trim() || required("OPENAI_API_KEY");
const client = new pg.Client({ connectionString: required("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const result = await client.query(
    `select id, tenant_id, provider_response_json->>'providerJobId' as provider_job_id
       from public.marketing_video_jobs
      where service_label = 'Ferocity launch campaign'
        and provider_key = 'openai_video'
        and provider_response_json->>'providerJobId' is not null
        and created_at > now() - interval '1 day'
      order by created_at desc
      limit 1`
  );
  const row = result.rows[0];
  if (!row?.provider_job_id) throw new Error("No recent Ferocity Sora launch job is available to resume.");

  await client.query(
    `update public.marketing_video_jobs set status = 'processing', error_message = null, updated_at = now()
      where id = $1 and tenant_id = $2`,
    [row.id, row.tenant_id]
  );
  await client.query(
    `update public.usage_meter_events set status = 'approved'
      where source_table = 'marketing_video_jobs' and source_id = $1 and tenant_id = $2`,
    [row.id, row.tenant_id]
  );

  let providerJob = { status: "processing" };
  const deadline = Date.now() + 15 * 60 * 1000;
  while (!['completed', 'failed'].includes(providerJob.status) && Date.now() < deadline) {
    const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(row.provider_job_id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!response.ok && (response.status === 429 || response.status >= 500)) {
      console.log(`Transient Sora status HTTP ${response.status}; retrying the same job.`);
      await wait(10_000);
      continue;
    }
    providerJob = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Video status refresh failed with HTTP ${response.status}.`);
    console.log(`Sora render status: ${providerJob.status || "processing"}${Number.isFinite(providerJob.progress) ? ` (${providerJob.progress}%)` : ""}.`);
    if (!['completed', 'failed'].includes(providerJob.status)) await wait(10_000);
  }
  if (providerJob.status !== "completed") throw new Error(providerJob.error?.message || "Sora render did not complete within the retrieval window.");

  const contentResponse = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(row.provider_job_id)}/content`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!contentResponse.ok) throw new Error(`Video download failed with HTTP ${contentResponse.status}.`);
  const bytes = Buffer.from(await contentResponse.arrayBuffer());
  if (!bytes.length) throw new Error("The completed video contained no bytes.");

  const outputDir = path.resolve("artifacts", "launch-video");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "ferocity-sora-launch-hook-2026-08-01.mp4");
  fs.writeFileSync(outputPath, bytes);

  await client.query(
    `update public.marketing_video_jobs set status = 'completed', output_url = $3,
       provider_response_json = provider_response_json || $4::jsonb,
       history_json = history_json || $5::jsonb, error_message = null, updated_at = now()
      where id = $1 and tenant_id = $2`,
    [row.id, row.tenant_id, `/api/video/${row.id}/content`,
      JSON.stringify({ providerStatus: "completed", downloadedBytes: bytes.length, localArtifact: path.relative(process.cwd(), outputPath) }),
      JSON.stringify([{ status: "completed", at: new Date().toISOString(), note: "Resumed provider job; completion, metering, and content retrieval verified." }])]
  );
  console.log(`Launch ad saved to ${outputPath} (${bytes.length} bytes).`);
} finally {
  await client.end();
}

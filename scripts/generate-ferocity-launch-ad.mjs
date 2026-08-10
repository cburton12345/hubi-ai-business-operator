import crypto from "node:crypto";
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

function positiveNumber(name) {
  const value = Number(required(name));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive.`);
  return value;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

loadLocalEnv();
if (process.env.ALLOW_LIVE_FEROCITY_AD !== "true") {
  throw new Error("Set ALLOW_LIVE_FEROCITY_AD=true only for an explicitly approved paid launch-ad render.");
}

const apiKey = process.env.VIDEO_API_KEY?.trim() || required("OPENAI_API_KEY");
const databaseUrl = required("DATABASE_URL");
const provider = required("VIDEO_PROVIDER").toLowerCase();
const model = required("VIDEO_MODEL");
const seconds = 12;
const providerCostPerSecond = positiveNumber("VIDEO_PROVIDER_COST_CENTS_PER_SECOND");
const globalCap = positiveNumber("VIDEO_MONTHLY_BUDGET_CENTS");
const workspaceCap = positiveNumber("VIDEO_WORKSPACE_MONTHLY_BUDGET_CENTS");
const estimatedCostCents = seconds * providerCostPerSecond;

if (!['openai', 'openai_video'].includes(provider)) throw new Error("OpenAI Video is not the configured provider.");
if (process.env.VIDEO_RENDERING_ENABLED?.toLowerCase() !== "true") throw new Error("Managed rendering is disabled.");
if (estimatedCostCents > 200) throw new Error(`Estimated provider cost ${estimatedCostCents} cents exceeds the $2 launch-ad safety ceiling.`);

const prompt = `Create a premium 12-second cinematic commercial in landscape 16:9 for a serious AI business operating system. Keep one consistent, believable service-business owner throughout. First three seconds: late afternoon in a real small service-business office, a capable owner is overwhelmed by ringing phone, paper estimate, scheduling changes, crew messages, and an unpaid invoice; show pressure through performance and composition, with no readable screen text. Seconds three through eight: the fragmented work becomes calm and coordinated across the office and field; dispatcher, technician, customer communication, schedule, job progress, invoice, and reputation move forward as one connected operation. Use subtle warm amber visual continuity and elegant match cuts, never holograms or science-fiction effects. Final four seconds: at golden hour the owner closes the laptop and leaves confidently while the team and authorized work continue moving smoothly. Grounded, premium, emotionally powerful, photorealistic commercial cinematography, natural faces and hands, restrained camera movement, warm charcoal and amber palette, credible American service business. Synced audio: realistic office and field ambience resolves into a confident modern pulse. One warm, calm, grounded narrator says exactly: "Your business shouldn't wait for someone to remember. Ferocity keeps the work moving." No other speech. No visible words, captions, logos, robots, floating interfaces, fake software screens, revenue claims, or magical transformations.`;

const tenantId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = `ferocity-launch-ad:${new Date().toISOString().slice(0, 10)}:${crypto.randomBytes(5).toString("hex")}`;
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

let videoJobId;
let usageId;
try {
  const brand = await client.query(
    "select id from public.brands where tenant_id = $1 and status = 'active' order by created_at limit 1",
    [tenantId]
  );
  if (!brand.rows[0]?.id) throw new Error("The internal workspace has no active brand.");
  const plan = await client.query(
    `select coalesce(
       (select bp.plan_key from public.billing_subscriptions bs join public.billing_plans bp on bp.plan_key = bs.plan_key where bs.tenant_id = $1 limit 1),
       (select bp.plan_key from public.tenants t join public.billing_plans bp on bp.plan_key = t.plan_key where t.id = $1 limit 1),
       'operator'
     ) as plan_key`,
    [tenantId]
  );
  const planKey = plan.rows[0]?.plan_key || "operator";

  const spend = await client.query(
    `select coalesce(sum(provider_cost_cents), 0)::numeric as global_cost,
       coalesce(sum(provider_cost_cents) filter (where tenant_id = $1), 0)::numeric as workspace_cost
     from public.usage_meter_events
     where feature_key = 'premium_video' and occurred_at >= date_trunc('month', now())
       and status not in ('void', 'failed')`,
    [tenantId]
  );
  const globalCost = Number(spend.rows[0].global_cost);
  const workspaceCost = Number(spend.rows[0].workspace_cost);
  if (globalCost + estimatedCostCents > globalCap || workspaceCost + estimatedCostCents > workspaceCap) {
    throw new Error("The launch-ad render would exceed a managed-video cost cap.");
  }

  await client.query("begin");
  const jobRow = await client.query(
    `insert into public.marketing_video_jobs (
       tenant_id, brand_id, provider_key, service_label, goal, status, script_text,
       provider_request_json, history_json, metadata_json
     ) values ($1, $2, 'openai_video', 'Ferocity launch campaign',
       'Create a truthful emotional launch hook showing coordinated persistence rather than another static workflow tool.',
       'submitted', $3, $4::jsonb, $5::jsonb, $6::jsonb)
     returning id`,
    [tenantId, brand.rows[0].id, prompt,
      JSON.stringify({ durationSeconds: seconds, aspectRatio: "16:9", size: "1280x720", model }),
      JSON.stringify([{ status: "submitted", at: new Date().toISOString(), note: "Owner-approved Ferocity launch-ad render." }]),
      JSON.stringify({ launchAd: true, durationSeconds: seconds, estimatedProviderCostCents: estimatedCostCents })]
  );
  videoJobId = jobRow.rows[0].id;
  const usage = await client.query(
    `insert into public.usage_meter_events (
       tenant_id, brand_id, plan_key, feature_key, provider_key, source_table, source_id,
       unit_type, quantity, provider_cost_cents, customer_charge_cents, status, source,
       idempotency_key, metadata_json
     ) values ($1, $2, $3, 'premium_video', 'openai_video', 'marketing_video_jobs', $4,
       'video_second', $5, $6, 0, 'pending_review', 'test', $7, $8::jsonb)
     returning id`,
    [tenantId, brand.rows[0].id, planKey, videoJobId, seconds, estimatedCostCents, idempotencyKey,
      JSON.stringify({ launchAd: true, explicitlyApproved: true, customerChargeCents: 0 })]
  );
  usageId = usage.rows[0].id;
  await client.query("commit");

  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);
  form.set("seconds", String(seconds));
  form.set("size", "1280x720");
  const createResponse = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": idempotencyKey },
    body: form
  });
  const created = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || !created.id) throw new Error(created.error?.message || `Video creation failed with HTTP ${createResponse.status}.`);

  await client.query(
    `update public.marketing_video_jobs set provider_response_json = $3::jsonb, updated_at = now() where tenant_id = $1 and id = $2`,
    [tenantId, videoJobId, JSON.stringify({ providerJobId: created.id, providerStatus: created.status, seconds, model })]
  );
  await client.query(
    `update public.usage_meter_events set provider_resource_id = $3, provider_event_id = $3, status = 'approved' where tenant_id = $1 and id = $2`,
    [tenantId, usageId, created.id]
  );
  console.log(`Submitted 12-second Sora launch ad; tracked job ${videoJobId}; estimated provider cost ${estimatedCostCents} cents.`);

  let providerJob = created;
  const deadline = Date.now() + 15 * 60 * 1000;
  while (!['completed', 'failed'].includes(providerJob.status) && Date.now() < deadline) {
    await wait(10_000);
    const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(created.id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    providerJob = await response.json().catch(() => ({}));
    if (!response.ok && (response.status === 429 || response.status >= 500)) {
      console.log(`Transient video status HTTP ${response.status}; continuing to poll the existing job.`);
      continue;
    }
    if (!response.ok) throw new Error(`Video status refresh failed with HTTP ${response.status}.`);
    console.log(`Sora render status: ${providerJob.status || "processing"}${Number.isFinite(providerJob.progress) ? ` (${providerJob.progress}%)` : ""}.`);
  }
  if (providerJob.status !== "completed") throw new Error(providerJob.error?.message || "Sora render did not complete within the generation window.");

  const contentResponse = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(created.id)}/content`, {
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
       history_json = history_json || $5::jsonb, updated_at = now()
     where tenant_id = $1 and id = $2`,
    [tenantId, videoJobId, `/api/video/${videoJobId}/content`,
      JSON.stringify({ providerStatus: "completed", downloadedBytes: bytes.length, localArtifact: path.relative(process.cwd(), outputPath) }),
      JSON.stringify([{ status: "completed", at: new Date().toISOString(), note: "Provider completion, metering, and content retrieval verified." }])]
  );
  console.log(`Launch ad saved to ${outputPath} (${bytes.length} bytes).`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  if (videoJobId) {
    await client.query(
      "update public.marketing_video_jobs set status = 'failed', error_message = $3, updated_at = now() where tenant_id = $1 and id = $2",
      [tenantId, videoJobId, error instanceof Error ? error.message.slice(0, 500) : "Launch ad render failed."]
    ).catch(() => undefined);
  }
  if (usageId) {
    await client.query(
      "update public.usage_meter_events set status = 'failed' where tenant_id = $1 and id = $2",
      [tenantId, usageId]
    ).catch(() => undefined);
  }
  throw error;
} finally {
  await client.end();
}

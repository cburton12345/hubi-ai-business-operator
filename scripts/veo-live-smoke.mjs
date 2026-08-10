import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";
import { GenerateVideosOperation, GoogleGenAI } from "@google/genai";

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
if (process.env.ALLOW_LIVE_VEO_SMOKE !== "true") {
  throw new Error("Set ALLOW_LIVE_VEO_SMOKE=true for the explicitly approved paid provider check.");
}

const apiKey = required("VIDEO_API_KEY");
const databaseUrl = required("DATABASE_URL");
const provider = required("VIDEO_PROVIDER");
const model = required("VIDEO_MODEL");
const providerCostPerSecond = positiveNumber("VIDEO_PROVIDER_COST_CENTS_PER_SECOND");
const globalCap = positiveNumber("VIDEO_MONTHLY_BUDGET_CENTS");
const workspaceCap = positiveNumber("VIDEO_WORKSPACE_MONTHLY_BUDGET_CENTS");
const seconds = 4;
const estimatedCostCents = seconds * providerCostPerSecond;
if (!['google_veo', 'google', 'veo'].includes(provider.toLowerCase())) throw new Error("Google Veo is not the configured provider.");
if (process.env.VIDEO_RENDERING_ENABLED?.toLowerCase() !== "true") throw new Error("Managed rendering is disabled.");
if (estimatedCostCents > 50) throw new Error(`Smoke render cost ${estimatedCostCents} cents exceeds the 50-cent safety ceiling.`);

const tenantId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = `veo-live-smoke:${new Date().toISOString().slice(0, 10)}:${crypto.randomBytes(5).toString("hex")}`;
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

let videoJobId;
let usageId;
try {
  await client.query("begin");
  const brand = await client.query(
    "select id from public.brands where tenant_id = $1 and status = 'active' order by created_at limit 1",
    [tenantId]
  );
  if (!brand.rows[0]?.id) throw new Error("The internal workspace has no active brand.");

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
    throw new Error("The controlled render would exceed a managed-video cost cap.");
  }

  const job = await client.query(
    `insert into public.marketing_video_jobs (
       tenant_id, brand_id, provider_key, service_label, goal, status, script_text,
       provider_request_json, history_json, metadata_json
     ) values ($1, $2, 'google_veo', 'Ferocity launch verification',
       'Verify that Ferocity can submit, refresh, meter, and retrieve a short managed video.',
       'submitted', 'A quiet, realistic exterior shot of a clean generic service van arriving at a well-maintained home at sunrise. No logos, text, people, claims, or identifiable addresses.',
       $3::jsonb, $4::jsonb, $5::jsonb)
     returning id`,
    [
      tenantId,
      brand.rows[0].id,
      JSON.stringify({ durationSeconds: seconds, aspectRatios: "16:9", model }),
      JSON.stringify([{ status: "submitted", at: new Date().toISOString(), note: "Explicitly approved low-cost launch verification render." }]),
      JSON.stringify({ liveSmoke: true, durationSeconds: seconds, estimatedProviderCostCents: estimatedCostCents })
    ]
  );
  videoJobId = job.rows[0].id;

  const usage = await client.query(
    `insert into public.usage_meter_events (
       tenant_id, brand_id, plan_key, feature_key, provider_key, source_table, source_id,
       unit_type, quantity, provider_cost_cents, customer_charge_cents, status, source,
       idempotency_key, metadata_json
     ) values ($1, $2, 'internal', 'premium_video', 'google_veo', 'marketing_video_jobs', $3,
       'video_second', $4, $5, 0, 'pending_review', 'test', $6, $7::jsonb)
     returning id`,
    [tenantId, brand.rows[0].id, videoJobId, seconds, estimatedCostCents, idempotencyKey,
      JSON.stringify({ liveSmoke: true, explicitlyApproved: true, customerChargeCents: 0 })]
  );
  usageId = usage.rows[0].id;
  await client.query("commit");

  const ai = new GoogleGenAI({ apiKey });
  let operation = await ai.models.generateVideos({
    model,
    prompt: "A quiet, realistic exterior shot of a clean generic service van arriving at a well-maintained home at sunrise. No logos, text, people, claims, or identifiable addresses.",
    config: { numberOfVideos: 1, durationSeconds: seconds, aspectRatio: "16:9", resolution: "720p", generateAudio: true }
  });
  if (!operation.name) throw new Error("Google Veo did not return an operation ID.");

  await client.query(
    `update public.marketing_video_jobs set provider_response_json = $3::jsonb, updated_at = now()
     where tenant_id = $1 and id = $2`,
    [tenantId, videoJobId, JSON.stringify({ providerJobId: operation.name, providerStatus: operation.done ? "completed" : "queued", seconds })]
  );
  await client.query(
    `update public.usage_meter_events set provider_resource_id = $3, provider_event_id = $3, status = 'approved'
     where tenant_id = $1 and id = $2`,
    [tenantId, usageId, operation.name]
  );
  console.log(`Submitted controlled ${seconds}-second Veo render; job ${videoJobId}; estimated provider cost ${estimatedCostCents} cents.`);

  const deadline = Date.now() + 10 * 60 * 1000;
  while (!operation.done && Date.now() < deadline) {
    await wait(10_000);
    const refresh = new GenerateVideosOperation();
    refresh.name = operation.name;
    operation = await ai.operations.getVideosOperation({ operation: refresh });
    await client.query(
      `update public.marketing_video_jobs set status = 'processing',
         provider_response_json = provider_response_json || $3::jsonb, updated_at = now()
       where tenant_id = $1 and id = $2`,
      [tenantId, videoJobId, JSON.stringify({ providerStatus: operation.done ? "completed" : "processing", refreshedAt: new Date().toISOString() })]
    );
  }
  if (!operation.done) throw new Error("Veo render is still processing after the ten-minute smoke window.");
  if (operation.error) throw new Error("Veo reported that the controlled render failed.");
  const video = operation.response?.generatedVideos?.[0]?.video;
  if (!video) throw new Error("Veo completed without a retrievable video.");

  let byteCount = 0;
  if (video.videoBytes) {
    byteCount = Buffer.from(video.videoBytes, "base64").byteLength;
  } else if (video.uri) {
    const response = await fetch(video.uri, { headers: { "x-goog-api-key": apiKey } });
    if (!response.ok) throw new Error(`Veo content retrieval failed with HTTP ${response.status}.`);
    byteCount = (await response.arrayBuffer()).byteLength;
  }
  if (byteCount <= 0) throw new Error("The completed video contained no retrievable bytes.");

  await client.query(
    `update public.marketing_video_jobs set status = 'completed', output_url = $3,
       provider_response_json = provider_response_json || $4::jsonb,
       history_json = history_json || $5::jsonb, updated_at = now()
     where tenant_id = $1 and id = $2`,
    [tenantId, videoJobId, `/api/video/${videoJobId}/content`, JSON.stringify({ providerStatus: "completed", retrievedBytes: byteCount }),
      JSON.stringify([{ status: "completed", at: new Date().toISOString(), note: "Provider completion and content retrieval verified." }])]
  );
  console.log(`Veo live smoke passed; completed content retrieval returned ${byteCount} bytes.`);
} catch (error) {
  if (videoJobId) {
    await client.query(
      "update public.marketing_video_jobs set status = 'failed', error_message = $3, updated_at = now() where tenant_id = $1 and id = $2",
      [tenantId, videoJobId, error instanceof Error ? error.message.slice(0, 500) : "Live smoke failed."]
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

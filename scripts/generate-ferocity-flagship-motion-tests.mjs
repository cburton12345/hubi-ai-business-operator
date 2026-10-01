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

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

loadLocalEnv();
if (process.env.ALLOW_LIVE_FEROCITY_FLAGSHIP_TESTS !== "true") {
  throw new Error("Set ALLOW_LIVE_FEROCITY_FLAGSHIP_TESTS=true only for owner-approved paid motion tests.");
}

const apiKey = process.env.VIDEO_API_KEY?.trim() || required("OPENAI_API_KEY");
const databaseUrl = required("DATABASE_URL");
const provider = required("VIDEO_PROVIDER").toLowerCase();
const model = required("VIDEO_MODEL");
const providerCostPerSecond = Number(required("VIDEO_PROVIDER_COST_CENTS_PER_SECOND"));
const globalCap = Number(required("VIDEO_MONTHLY_BUDGET_CENTS"));
const workspaceCap = Number(required("VIDEO_WORKSPACE_MONTHLY_BUDGET_CENTS"));
const motionTests = [
  {
    key: "founder-v1",
    seconds: 4,
    reference: "artifacts/launch-video/founder-flagship-preproduction/motion-reference-founder.png",
    output: "artifacts/launch-video/founder-flagship-preproduction/motion-test-founder-v1.mp4",
    prompt: "Preserve this exact founder, face, hair, build, wardrobe, boat, dock, and Wisconsin lakeside composition. Create four seconds of subtle photorealistic premium commercial motion: gentle lake ripples, slight natural wind in hair and shirt, warm sunset light shifting, an almost imperceptible slow camera push. He breathes naturally and looks calmly across the water; he does not speak, work, use a phone, or look at the camera. No identity changes, face warping, extra people, text, logos, UI, headset, laptop, or dramatic action. Natural lakeside ambience only."
  },
  {
    key: "coordination-v1",
    seconds: 4,
    reference: "artifacts/launch-video/founder-flagship-preproduction/motion-reference-coordination.png",
    output: "artifacts/launch-video/founder-flagship-preproduction/motion-test-coordination-v1.mp4",
    prompt: "Preserve the three-part professional, field-service, and customer composition. Create four seconds of restrained photorealistic coordinated motion: the advisor listens and makes one small natural gesture, the field professional receives a useful update and calmly begins moving, the customer sees confirmation and relaxes. The warm amber connection travels once from left to right, elegant and subtle rather than sci-fi. Natural hands and faces, premium commercial lighting, no dialogue, no readable text, no logos, no new people, no holograms, no exaggerated reactions. Quiet office, outdoor, and phone ambience blended into one confident pulse."
  }
];

const masterTests = [
  {
    key: "proof-to-growth-master-v1",
    seconds: 12,
    reference: "artifacts/launch-video/founder-flagship-preproduction/master-reference-proof-growth.png",
    output: "artifacts/launch-video/founder-flagship-preproduction/master-scene-proof-to-growth-v1.mp4",
    prompt: "Preserve the believable people and completed-work setting from the reference, then create a premium 12-second commercial sequence showing work becoming growth without magical UI. Begin with a field team capturing approved photos of completed work and, in parallel, a professional client-service team documenting an approved customer outcome. Transition naturally into useful channel-specific organic content being prepared from that real proof, then show a new inquiry being answered, a proposal or estimate prepared, scheduling coordinated, the customer updated, and secure payment confirmed. Balance professional and field-service businesses equally. Use elegant match cuts and restrained charcoal, amber, and blue continuity. No founder, no dialogue, no readable generated text, no fake reviews, no revenue figures, no logos, no dashboards, no paid-ad launch, no holograms, no robots, no impossible transformations. Realistic hands and faces, high-end documentary-commercial cinematography, confident modern pulse and natural ambience."
  },
  {
    key: "founder-decision-master-v1",
    seconds: 8,
    reference: "artifacts/launch-video/founder-flagship-preproduction/master-reference-founder-decision.png",
    output: "artifacts/launch-video/founder-flagship-preproduction/master-scene-founder-decision-v1.mp4",
    prompt: "Preserve this exact founder's recognizable face, hair, blue eyes, proportions, build, black shirt, Wisconsin lake, dock, boat, and golden-hour environment. Create eight seconds of photorealistic premium commercial motion. He glances at the phone, makes one confident tap on a clean screen with no readable text, slips the phone into his pocket, turns, and walks naturally toward the boat as the camera eases wider toward the sunset water. His expression is calm and relieved, not performing for camera and not working at a desk. Natural hands, no face warping, no extra people, no dialogue, no logos, no headset, no laptop, no UI overlays, no sudden cuts, no exaggerated smile. End with open water and generous negative space for a Ferocity end title added in post. Natural lakeside ambience and a subtle resolving musical lift."
  }
];

const tests = process.env.FEROCITY_VIDEO_BATCH === "master" ? masterTests : motionTests;

if (!["openai", "openai_video"].includes(provider)) throw new Error("OpenAI Video is not the configured provider.");
if (process.env.VIDEO_RENDERING_ENABLED?.toLowerCase() !== "true") throw new Error("Managed rendering is disabled.");
if (!Number.isFinite(providerCostPerSecond) || providerCostPerSecond <= 0) throw new Error("Invalid video cost setting.");
const estimatedTotalCents = tests.reduce((total, test) => total + test.seconds * providerCostPerSecond, 0);
const safetyCeilingCents = process.env.FEROCITY_VIDEO_BATCH === "master" ? 200 : 100;
if (estimatedTotalCents > safetyCeilingCents) throw new Error(`Render cost ${estimatedTotalCents} cents exceeds the ${safetyCeilingCents}-cent safety ceiling.`);

const tenantId = "11111111-1111-4111-8111-111111111111";
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

async function createAndRetrieve(test, brandId, planKey) {
  const seconds = test.seconds;
  const idempotencyKey = `ferocity-flagship-motion-test:${test.key}`;
  const existing = await client.query(
    `select u.source_id as video_job_id, u.provider_resource_id, j.status, j.output_url
       from public.usage_meter_events u
       join public.marketing_video_jobs j on j.id::text = u.source_id
      where u.tenant_id = $1 and u.idempotency_key = $2
      limit 1`,
    [tenantId, idempotencyKey]
  );
  const outputPath = path.resolve(test.output);
  if (existing.rows[0]?.status === "completed" && fs.existsSync(outputPath)) {
    console.log(`${test.key}: already completed at ${outputPath}`);
    return;
  }
  if (existing.rows[0]) throw new Error(`${test.key} already has an unfinished tracked attempt; inspect it instead of creating a duplicate.`);

  const estimatedCostCents = seconds * providerCostPerSecond;
  await client.query("begin");
  let videoJobId;
  let usageId;
  try {
    const job = await client.query(
      `insert into public.marketing_video_jobs (
         tenant_id, brand_id, provider_key, service_label, goal, status, script_text,
         provider_request_json, history_json, metadata_json
       ) values ($1, $2, 'openai_video', 'Ferocity founder flagship motion test',
         'Test identity, movement, and production quality before authorizing a complete flagship render.',
         'submitted', $3, $4::jsonb, $5::jsonb, $6::jsonb)
       returning id`,
      [tenantId, brandId, test.prompt,
        JSON.stringify({ durationSeconds: seconds, aspectRatio: "16:9", size: "1280x720", model, inputReference: test.reference }),
        JSON.stringify([{ status: "submitted", at: new Date().toISOString(), note: "Owner-approved limited flagship motion test." }]),
        JSON.stringify({ flagshipMotionTest: true, testKey: test.key, estimatedProviderCostCents: estimatedCostCents })]
    );
    videoJobId = job.rows[0].id;
    const usage = await client.query(
      `insert into public.usage_meter_events (
         tenant_id, brand_id, plan_key, feature_key, provider_key, source_table, source_id,
         unit_type, quantity, provider_cost_cents, customer_charge_cents, status, source,
         idempotency_key, metadata_json
       ) values ($1, $2, $3, 'premium_video', 'openai_video', 'marketing_video_jobs', $4,
         'video_second', $5, $6, 0, 'pending_review', 'test', $7, $8::jsonb)
       returning id`,
      [tenantId, brandId, planKey, videoJobId, seconds, estimatedCostCents, idempotencyKey,
        JSON.stringify({ flagshipMotionTest: true, explicitlyApproved: true, customerChargeCents: 0 })]
    );
    usageId = usage.rows[0].id;
    await client.query("commit");

    const referenceBytes = fs.readFileSync(path.resolve(test.reference));
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", test.prompt);
    form.set("seconds", String(seconds));
    form.set("size", "1280x720");
    form.set("input_reference", new Blob([referenceBytes], { type: "image/png" }), path.basename(test.reference));
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
    console.log(`${test.key}: submitted; estimated provider cost ${estimatedCostCents} cents.`);

    let providerJob = created;
    const deadline = Date.now() + 15 * 60 * 1000;
    while (!["completed", "failed"].includes(providerJob.status) && Date.now() < deadline) {
      await wait(10_000);
      const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(created.id)}`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      providerJob = await response.json().catch(() => ({}));
      if (!response.ok && (response.status === 429 || response.status >= 500)) continue;
      if (!response.ok) throw new Error(`Video status refresh failed with HTTP ${response.status}.`);
      console.log(`${test.key}: ${providerJob.status || "processing"}${Number.isFinite(providerJob.progress) ? ` ${providerJob.progress}%` : ""}`);
    }
    if (providerJob.status !== "completed") throw new Error(providerJob.error?.message || `${test.key} did not complete.`);

    const contentResponse = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(created.id)}/content`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!contentResponse.ok) throw new Error(`Video download failed with HTTP ${contentResponse.status}.`);
    const bytes = Buffer.from(await contentResponse.arrayBuffer());
    if (!bytes.length) throw new Error("The completed video contained no bytes.");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, bytes);
    await client.query(
      `update public.marketing_video_jobs set status = 'completed', output_url = $3,
         provider_response_json = provider_response_json || $4::jsonb,
         history_json = history_json || $5::jsonb, updated_at = now()
       where tenant_id = $1 and id = $2`,
      [tenantId, videoJobId, `/api/video/${videoJobId}/content`,
        JSON.stringify({ providerStatus: "completed", downloadedBytes: bytes.length, localArtifact: test.output }),
        JSON.stringify([{ status: "completed", at: new Date().toISOString(), note: "Motion test retrieved and saved for owner review." }])]
    );
    console.log(`${test.key}: saved ${outputPath} (${bytes.length} bytes).`);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if (videoJobId) {
      await client.query(
        "update public.marketing_video_jobs set status = 'failed', error_message = $3, updated_at = now() where tenant_id = $1 and id = $2",
        [tenantId, videoJobId, error instanceof Error ? error.message.slice(0, 500) : "Motion test failed."]
      ).catch(() => undefined);
    }
    if (usageId) {
      await client.query("update public.usage_meter_events set status = 'failed' where tenant_id = $1 and id = $2", [tenantId, usageId]).catch(() => undefined);
    }
    throw error;
  }
}

try {
  const brand = await client.query("select id from public.brands where tenant_id = $1 and status = 'active' order by created_at limit 1", [tenantId]);
  if (!brand.rows[0]?.id) throw new Error("The internal workspace has no active brand.");
  const plan = await client.query(
    `select coalesce(
       (select bp.plan_key from public.billing_subscriptions bs join public.billing_plans bp on bp.plan_key = bs.plan_key where bs.tenant_id = $1 limit 1),
       (select bp.plan_key from public.tenants t join public.billing_plans bp on bp.plan_key = t.plan_key where t.id = $1 limit 1),
       'operator'
     ) as plan_key`,
    [tenantId]
  );
  const spend = await client.query(
    `select coalesce(sum(provider_cost_cents), 0)::numeric as global_cost,
            coalesce(sum(provider_cost_cents) filter (where tenant_id = $1), 0)::numeric as workspace_cost
       from public.usage_meter_events
      where feature_key = 'premium_video' and occurred_at >= date_trunc('month', now())
        and status not in ('void', 'failed')`,
    [tenantId]
  );
  if (Number(spend.rows[0].global_cost) + estimatedTotalCents > globalCap || Number(spend.rows[0].workspace_cost) + estimatedTotalCents > workspaceCap) {
    throw new Error("The two motion tests would exceed a managed-video cost cap.");
  }
  for (const test of tests) await createAndRetrieve(test, brand.rows[0].id, plan.rows[0]?.plan_key || "operator");
  console.log(`Flagship ${process.env.FEROCITY_VIDEO_BATCH === "master" ? "master scenes" : "motion tests"} completed. Estimated total provider cost: ${estimatedTotalCents} cents.`);
} finally {
  await client.end();
}

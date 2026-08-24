import fs from "node:fs";
import pg from "pg";

function loadLocalEnv() {
  if (!fs.existsSync(".env.local")) return;
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function line(label, detail) {
  console.log(`${label.padEnd(28)} ${detail}`);
}

async function postForm(baseUrl, path, values) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) form.append(key, item);
    } else if (value !== undefined && value !== null) {
      form.append(key, value);
    }
  }

  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    body: form,
    redirect: "manual"
  });
}

async function expireStripeCheckout(sessionId) {
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams()
    }
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Stripe smoke checkout cleanup failed (${response.status}): ${body.slice(0, 240)}`);
  }
}

loadLocalEnv();

const baseUrl = (process.env.FEROCITY_SMOKE_URL ?? process.env.FEROCITY_APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
assert(process.env.DATABASE_URL, "DATABASE_URL is required for customer path smoke.");

const id = Date.now().toString(36);
const setupEmail = `ferocity-smoke-${id}@ferocity.live`;
const graderEmail = `ferocity-grader-${id}@ferocity.live`;
const companyName = `Ferocity Smoke ${id}`;

const accessResponse = await postForm(baseUrl, "/api/access-requests", {
  name: "Launch Smoke",
  email: setupEmail,
  phone: "555-0100",
  companyName,
  businessType: "Roofing",
  websiteUrl: "https://ferocity.live",
  websiteConnectionPlan: "embed_form",
  requestedPlan: "starter",
  mainGoal: "make_more_money",
  leadSources: ["website_form", "marketplace", "phone_calls"],
  autopilotAreas: ["owner_briefing", "lead_follow_up", "invoice_collection", "jobs_tasks"],
  autonomyMode: "approval_first",
  message: "Smoke test: create workspace, seed sources, keep live actions gated.",
  sourceDetail: "customer_path_smoke",
  consentToContact: "on",
  createWorkspace: "on",
  website: ""
});

assert([302, 303, 307, 308].includes(accessResponse.status), `access request expected redirect, got ${accessResponse.status}`);
const accessLocation = accessResponse.headers.get("location") ?? "";
assert(accessLocation.includes("/start/thanks"), `access request redirected to unexpected location: ${accessLocation}`);
line("Access request", `${accessResponse.status} ${accessLocation.replace(/invite=[^&]+/, "invite=redacted")}`);

const graderResponse = await postForm(baseUrl, "/api/website-grader", {
  email: graderEmail,
  name: "Launch Grader",
  companyName: `${companyName} Grader`,
  businessType: "Roofing",
  city: "Eau Claire",
  state: "WI",
  serviceArea: "Eau Claire, Chippewa Falls, Altoona",
  websiteUrl: "",
  googleBusinessProfileUrl: "",
  leadResponse: "some",
  followUp: "missing",
  reviews: "some",
  payments: "some",
  operations: "missing",
  hiring: "not_sure",
  retention: "missing",
  marketingChannels: ["local_seo", "reviews", "facebook"],
  consentToContact: "on",
  website: ""
});

assert([302, 303, 307, 308].includes(graderResponse.status), `business grader expected redirect, got ${graderResponse.status}`);
const graderLocation = graderResponse.headers.get("location") ?? "";
assert(graderLocation.includes("/business-health-score/report/"), `business grader redirected to unexpected location: ${graderLocation}`);
line("Business Grader", `${graderResponse.status} ${graderLocation}`);

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
let smokeAccessRow;
let smokeGraderRow;
await client.connect();

try {
  const access = await client.query(
    `
    select ar.id,
           ar.status,
           ar.metadata_json,
           t.id as tenant_id,
           t.slug,
           t.account_type,
           t.plan_key,
           t.billing_status,
           (
             select count(*)
             from public.growth_sources gs
             where gs.tenant_id = t.id
           )::int as growth_source_count,
           (
             select count(*)
             from public.forms f
             where f.tenant_id = t.id and f.active = true
           )::int as active_form_count,
           (
             select count(*)
             from public.workspace_invites wi
             where wi.tenant_id = t.id and lower(wi.email) = lower($1)
           )::int as invite_count
    from public.access_requests ar
    left join public.tenants t on t.id = (ar.metadata_json->>'workspaceId')::uuid
    where lower(ar.email) = lower($1)
    order by ar.created_at desc
    limit 1
    `,
    [setupEmail]
  );
  const accessRow = access.rows[0];
  smokeAccessRow = accessRow;
  assert(accessRow, "access request row was not created");
  assert(accessRow.status === "invited", `access request status expected invited, got ${accessRow.status}`);
  assert(accessRow.account_type === "customer", "auto workspace should be a customer workspace");
  assert(accessRow.billing_status === "trialing", `starter workspace should be trialing, got ${accessRow.billing_status}`);
  assert(Number(accessRow.growth_source_count) >= 3, "lead sources were not seeded");
  assert(Number(accessRow.active_form_count) >= 1, "lead form was not seeded");
  assert(Number(accessRow.invite_count) >= 1, "workspace invite was not created");
  assert(Array.isArray(accessRow.metadata_json?.leadSources) && accessRow.metadata_json.leadSources.includes("marketplace"), "marketplace lead source was not preserved");
  line("Workspace seed", `${accessRow.slug} ${accessRow.plan_key}/${accessRow.billing_status}; sources=${accessRow.growth_source_count}; forms=${accessRow.active_form_count}; invite=yes`);

  const grader = await client.query(
    `
    select report_token, status, score, grade_label, metadata_json
    from public.website_grader_reports
    where lower(email) = lower($1)
    order by created_at desc
    limit 1
    `,
    [graderEmail]
  );
  const graderRow = grader.rows[0];
  smokeGraderRow = graderRow;
  assert(graderRow, "business grader report row was not created");
  assert(["completed", "failed"].includes(graderRow.status), `unexpected grader status ${graderRow.status}`);
  assert(Number.isFinite(Number(graderRow.score)), "grader score missing");
  assert(graderRow.metadata_json?.assessmentType === "business_health_score", "grader metadata missing assessment type");
  line("Grader report", `${graderRow.status} score=${graderRow.score} label=${graderRow.grade_label}`);

  const opportunities = await client.query(
    `
    select
      (select count(*) from public.leads where lower(email) in (lower($1), lower($2)))::int as leads,
      (
        select count(*)
        from public.owner_command_events
        where platform_key = 'ferocity'
          and external_event_id in (
            'access-request:' || $3,
            'business-grader:' || $4
          )
      )::int as owner_events
    `,
    [setupEmail, graderEmail, accessRow.id, graderRow.report_token]
  );
  assert(Number(opportunities.rows[0]?.leads ?? 0) >= 2, "sales leads were not recorded");
  assert(Number(opportunities.rows[0]?.owner_events ?? 0) >= 2, "owner command events were not recorded");
  line("Sales/owner records", `${opportunities.rows[0].leads} leads; ${opportunities.rows[0].owner_events} owner events`);
} finally {
  await client.end();
}

const freeCheckout = await postForm(baseUrl, "/api/billing/checkout", {
  plan: "free",
  source: "customer_path_smoke"
});
assert([302, 303, 307, 308].includes(freeCheckout.status), `free checkout expected redirect, got ${freeCheckout.status}`);
const freeLocation = freeCheckout.headers.get("location") ?? "";
assert(
  freeLocation.includes("/pricing") && freeLocation.includes("billing=invalid_plan"),
  `removed free plan should return to pricing, got: ${freeLocation}`
);
line("No free subscription", `${freeCheckout.status} ${freeLocation}`);

const paidCheckout = await postForm(baseUrl, "/api/billing/checkout", {
  plan: "starter",
  source: "customer_path_smoke",
  email: setupEmail,
  name: "Launch Smoke",
  companyName,
  consentToContact: "on",
  termsAccepted: "on"
});
assert([302, 303, 307, 308].includes(paidCheckout.status), `starter checkout expected redirect, got ${paidCheckout.status}`);
const paidLocation = paidCheckout.headers.get("location") ?? "";
assert(paidLocation.startsWith("https://checkout.stripe.com/") || paidLocation.includes("/start?"), `starter checkout redirected to unexpected location: ${paidLocation}`);
line("Starter checkout", paidLocation.startsWith("https://checkout.stripe.com/") ? "created Stripe checkout session" : paidLocation);

if (paidLocation.startsWith("https://checkout.stripe.com/") && process.env.STRIPE_SECRET_KEY) {
  const sessionId = new URL(paidLocation).pathname
    .split("/")
    .find((part) => part.startsWith("cs_"));
  if (sessionId) {
    await expireStripeCheckout(sessionId);
    line("Checkout cleanup", "expired smoke checkout without payment");
  }
}

const cleanupClient = new Client({ connectionString: process.env.DATABASE_URL });
await cleanupClient.connect();
try {
  await cleanupClient.query("begin");
  await cleanupClient.query(
    `delete from public.owner_command_events
     where external_event_id in ($1, $2)`,
    [
      smokeAccessRow?.id ? `access-request:${smokeAccessRow.id}` : "",
      smokeGraderRow?.report_token ? `business-grader:${smokeGraderRow.report_token}` : ""
    ]
  );
  await cleanupClient.query(
    `delete from public.leads where lower(email) in (lower($1), lower($2))`,
    [setupEmail, graderEmail]
  );
  if (smokeGraderRow?.report_token) {
    await cleanupClient.query(
      `delete from public.website_grader_reports where report_token=$1`,
      [smokeGraderRow.report_token]
    );
  }
  await cleanupClient.query(
    `delete from public.access_requests where lower(email)=lower($1)`,
    [setupEmail]
  );
  if (smokeAccessRow?.tenant_id) {
    await cleanupClient.query(`delete from public.tenants where id=$1`, [smokeAccessRow.tenant_id]);
  }
  await cleanupClient.query("commit");
  line("Database cleanup", "removed smoke workspace, lead, grader, invite, and owner-event records");
} catch (error) {
  await cleanupClient.query("rollback");
  throw error;
} finally {
  await cleanupClient.end();
}

console.log("Customer path smoke passed.");

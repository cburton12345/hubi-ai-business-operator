import { randomUUID } from "node:crypto";
import fs from "node:fs";
import pg from "pg";

if (fs.existsSync(".env.local")) {
  for (const rawLine of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

const baseUrl = (process.env.FEROCITY_SMOKE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const scenarioCatalog = [
  {
    name: "professional firm growth and capacity",
    first: "I run a regional accounting firm. Client onboarding is slow, staff chase documents, and I want to grow without hiring five more people. What would Ferocity actually do?",
    correction: "Be more direct. What would Ferocity do inside the platform, and what would still need my approval?",
  },
  {
    name: "field service profit and scheduling",
    first: "I own a landscaping company. We stay busy but profit is weak and every schedule change comes back to me. Find the real bottleneck and explain what Ferocity would operate.",
    correction: "Do not give me a generic checklist. Tell me the first concrete move and where Ferocity handles it.",
  },
  {
    name: "ecommerce retention and operations",
    first: "I run an ecommerce brand. Ads bring orders, but repeat purchases are weak, support is messy, and I cannot tell which promotions make profit. How would Ferocity solve this?",
    correction: "Explain how the systems work together instead of listing tools.",
  },
  {
    name: "small law firm growth and intake",
    first: "I run a small law firm and want to reach seven figures without destroying client service. Intake is inconsistent and too much depends on me. What would Ferocity do first?",
    correction: "Treat this as a law firm, not a contractor. Give me a practical first move and explain what Ferocity would operate.",
  },
  {
    name: "dental practice capacity and retention",
    first: "I run a dental practice. We have open chair time, missed calls, no-show risk, and weak recall follow-up. Diagnose the bottleneck without giving medical advice.",
    correction: "Connect the patient communication, schedule, collections, and retention pieces into one plan.",
  },
  {
    name: "nonprofit donor operations",
    first: "I lead a local nonprofit. Donor follow-up and volunteer coordination are inconsistent, and reporting takes too much staff time. How could Ferocity help?",
    correction: "Prioritize mission impact and limited staff capacity, not generic revenue advice.",
  },
  {
    name: "property management operations",
    first: "I manage rental properties. Maintenance requests, vendor follow-up, tenant communication, receipts, and owner reporting are scattered. What is the first useful Ferocity workflow?",
    correction: "Show how the handoffs stay connected from request through cost and reporting.",
  },
  {
    name: "creative agency profitability",
    first: "I own a creative agency. We win projects but scope creep and slow approvals hurt margin. I cannot tell which clients are truly profitable. What should Ferocity change?",
    correction: "Give me an operating answer across sales, delivery, time, invoicing, and retention.",
  },
  {
    name: "restaurant multi-location control",
    first: "I operate three restaurants. Staffing, vendor issues, reviews, promotions, and owner reporting are inconsistent by location. Where would Ferocity begin?",
    correction: "Separate what can be standardized from what each location manager still decides.",
  },
  {
    name: "manufacturing quote to delivery",
    first: "I run a small manufacturer. Quotes take too long, material changes cause delays, and customers learn about problems late. How would Ferocity coordinate this?",
    correction: "Focus on quote, purchasing, production commitments, customer updates, and cash.",
  },
  {
    name: "wholesale inventory and accounts",
    first: "I own a wholesale business. Sales reps, inventory promises, purchase orders, and overdue accounts do not stay aligned. Find the highest-value starting point.",
    correction: "Do not list software modules. Explain the first operating loop Ferocity would improve.",
  },
  {
    name: "fitness studio retention",
    first: "I run a fitness studio. Leads try a class but follow-up, attendance, renewals, and referrals are inconsistent. What would Ferocity actually operate?",
    correction: "Tie the plan to retained members and collected revenue, not likes or message volume.",
  },
  {
    name: "consulting firm delivery and cash",
    first: "I run a consulting firm. Proposals, client decisions, deliverables, time, and invoices live in different places. How would Ferocity reduce owner dependence?",
    correction: "Tell me what can move automatically and which client decisions must stay human.",
  },
  {
    name: "roofing demand and job profit",
    first: "I own a roofing company. Leads spike after storms, estimates stall, crews change, and I learn job profit too late. Diagnose the first move.",
    correction: "Connect demand, sales, capacity, job execution, collections, and reviews without assuming ad spend.",
  },
  {
    name: "plumbing dispatch and callbacks",
    first: "I own a plumbing company. Missed calls, dispatch changes, callbacks, and invoice follow-up are costing us. What should Ferocity handle first?",
    correction: "Use the actual operating sequence from incoming call through payment and repeat customer.",
  },
  {
    name: "home cleaning recurring revenue",
    first: "I run a residential cleaning company. One-time jobs are fine, but recurring conversion, crew consistency, and customer follow-up are weak. How would Ferocity improve it?",
    correction: "Prioritize recurring collected revenue and service quality, not a generic marketing campaign.",
  },
  {
    name: "auto repair customer flow",
    first: "I run an auto repair shop. Calls, estimates, parts delays, approvals, status updates, and review requests are inconsistent. What would Ferocity coordinate?",
    correction: "Show the connected customer and work journey, including what still requires technician judgment.",
  },
  {
    name: "insurance agency renewals",
    first: "I own an insurance agency. New inquiries, document collection, renewal follow-up, and cross-sell opportunities get missed. Where would Ferocity start?",
    correction: "Keep regulated decisions human and focus on operations, communication, and opportunity follow-through.",
  },
  {
    name: "real estate brokerage follow-through",
    first: "I run a real estate brokerage. Leads come from many places, agent follow-up varies, and past clients are not consistently nurtured. Diagnose it.",
    correction: "Explain how Ferocity supports agents without pretending it replaces licensed judgment.",
  },
  {
    name: "private education enrollment",
    first: "I operate a tutoring center. Inquiries, assessments, scheduling, parent updates, billing, and renewals do not stay connected. What would Ferocity do?",
    correction: "Give me the first practical workflow and how results would be measured.",
  },
  {
    name: "event company coordination",
    first: "I own an event production company. Quotes, deposits, vendors, schedules, changes, and final payments are chaotic. Where is the biggest Ferocity opportunity?",
    correction: "Map the handoffs and identify what can be automated safely versus approved.",
  },
  {
    name: "saas onboarding and expansion",
    first: "I run a B2B SaaS company. Trials start, onboarding stalls, support context is fragmented, and expansion signals get missed. How would Ferocity help?",
    correction: "Connect acquisition to activation, retention, expansion, and actual revenue.",
  },
  {
    name: "retail store local growth",
    first: "I run two specialty retail stores. Local visibility, promotions, inventory questions, customer follow-up, and attribution are weak. What would Ferocity prioritize?",
    correction: "Balance organic local growth, store operations, and measurable sales without promising rankings.",
  },
  {
    name: "logistics delivery exceptions",
    first: "I run a local logistics company. Dispatch changes, proof of delivery, customer updates, driver hours, and billing exceptions consume the office. What should Ferocity fix first?",
    correction: "Explain the exception-handling loop and where human dispatch judgment remains essential.",
  },
  {
    name: "architecture firm project control",
    first: "I own an architecture firm. Proposals, client approvals, project phases, consultant coordination, time, and invoicing drift apart. How would Ferocity operate across them?",
    correction: "Do not force this into a jobsite workflow. Use professional-project language and give a concrete starting point.",
  },
  {
    name: "financial bookkeeping practice",
    first: "I run a bookkeeping practice. Client document chasing, monthly close tasks, questions, billing, and renewals depend on staff memory. What would Ferocity improve?",
    correction: "Protect sensitive data and describe an approval-safe operating rhythm.",
  },
  {
    name: "salon schedule and loyalty",
    first: "I own a salon. No-shows, open schedule gaps, rebooking, staff availability, reviews, and retail follow-up are inconsistent. What is the best first move?",
    correction: "Tie recommendations to utilization, retention, and collected revenue.",
  },
  {
    name: "healthcare adjacent home care",
    first: "I run a non-medical home care company. Inquiries, caregiver availability, scheduling changes, family communication, hours, and billing are difficult to coordinate. How could Ferocity help?",
    correction: "Stay within operational support and make clear where human and regulated decisions remain.",
  },
  {
    name: "construction supplier sales",
    first: "I run a building-material supplier. Contractor inquiries, quotes, stock promises, deliveries, account balances, and repeat sales are disconnected. Diagnose the bottleneck.",
    correction: "Show the first cross-department workflow Ferocity could improve and how it proves value.",
  },
  {
    name: "franchise owner oversight",
    first: "I oversee several franchise locations. Each location handles leads, reviews, staff issues, local marketing, and reporting differently. What would Ferocity centralize?",
    correction: "Separate shared standards, local authority, and owner-level exception reporting.",
  },
];

const requestedLimit = Number(process.env.PUBLIC_SALES_CERT_LIMIT ?? scenarioCatalog.length);
const requestedOffset = Number(process.env.PUBLIC_SALES_CERT_OFFSET ?? 0);
const scenarioLimit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(Math.floor(requestedLimit), scenarioCatalog.length)) : scenarioCatalog.length;
const scenarioOffset = Number.isFinite(requestedOffset) ? Math.max(0, Math.min(Math.floor(requestedOffset), scenarioCatalog.length - 1)) : 0;
const scenarios = scenarioCatalog.slice(scenarioOffset, scenarioOffset + scenarioLimit);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const created = [];

function repeatedAnswer(first, second) {
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const a = normalize(first);
  const b = normalize(second);
  return a === b || (a.length > 120 && b.includes(a.slice(0, 120)));
}

try {
  const form = await client.query(`
    select f.public_key, f.tenant_id
    from public.forms f
    join public.tenants t on t.id=f.tenant_id
    join public.brands b on b.id=f.brand_id and b.tenant_id=f.tenant_id
    where f.active=true and lower(b.slug)='ferocity' and lower(t.name)='internal portfolio'
    order by f.created_at asc limit 1
  `);
  if (!form.rows[0]) throw new Error("Ferocity public sales form was not found.");

  // Remove only exact prior certification prompts. This also cleans up a run
  // interrupted before its normal finally block.
  await client.query(`
    delete from public.messaging_conversations c
    where c.tenant_id=$1 and c.provider_key='ferocity_web_chat'
      and exists (
        select 1 from public.messages m
        where m.tenant_id=c.tenant_id and m.conversation_id=c.id
          and m.direction='inbound' and m.body = any($2::text[])
      )
  `, [form.rows[0].tenant_id, scenarioCatalog.flatMap((scenario) => [scenario.first, scenario.correction])]);

  async function certifyScenario(scenario) {
    const sessionId = randomUUID();
    const send = async (message) => {
      const response = await fetch(`${baseUrl}/api/public/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ferocity-certification": "public-sales-ai",
        },
        body: JSON.stringify({
          formPublicKey: form.rows[0].public_key,
          sessionId,
          message,
          experience: "ferocity_sales",
          consentToContact: false,
          website: "",
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(`${scenario.name} returned ${response.status}: ${JSON.stringify(body).slice(0, 400)}`);
      return body;
    };

    const first = await send(scenario.first);
    const second = await send(scenario.correction);
    if (typeof first.reply !== "string" || first.reply.length < 180) throw new Error(`${scenario.name}: first answer was not useful enough.`);
    if (typeof second.reply !== "string" || second.reply.length < 140) throw new Error(`${scenario.name}: correction answer was not useful enough.`);
    if (repeatedAnswer(first.reply, second.reply)) throw new Error(`${scenario.name}: Ferocity repeated itself after correction.`);
    if (!Array.isArray(first.recommendations) || first.recommendations.length < 1 || first.recommendations.length > 3) {
      throw new Error(`${scenario.name}: Ferocity did not return a focused capability path.`);
    }
    if (first.recommendations.some((item) => typeof item.href !== "string" || !item.href.startsWith("/"))) {
      throw new Error(`${scenario.name}: Ferocity returned an unsafe capability link.`);
    }

    const conversation = await client.query(`
      select c.id,
        array_agg(m.metadata_json->>'responseMode' order by m.created_at)
          filter (where m.direction='outbound') as response_modes
      from public.messaging_conversations c
      join public.messages m on m.tenant_id=c.tenant_id and m.conversation_id=c.id
      where c.tenant_id=$1 and c.provider_key='ferocity_web_chat'
        and c.external_conversation_ref=$2
      group by c.id
    `, [form.rows[0].tenant_id, `${form.rows[0].public_key}:${sessionId}`]);
    const row = conversation.rows[0];
    if (!row || row.response_modes?.length !== 2 || row.response_modes.some((mode) => mode !== "live_ai")) {
      throw new Error(`${scenario.name}: a response was not verified as live AI (${JSON.stringify(row?.response_modes ?? [])}).`);
    }
    created.push({ tenantId: form.rows[0].tenant_id, conversationId: row.id });
    console.log(`PASS: ${scenario.name}`);
  }

  const configuredConcurrency = Number(process.env.PUBLIC_SALES_CERT_CONCURRENCY ?? 3);
  const concurrency = Number.isFinite(configuredConcurrency)
    ? Math.max(1, Math.min(Math.floor(configuredConcurrency), 4, scenarios.length))
    : Math.min(3, scenarios.length);
  let nextScenarioIndex = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (nextScenarioIndex < scenarios.length) {
      const scenario = scenarios[nextScenarioIndex];
      nextScenarioIndex += 1;
      await certifyScenario(scenario);
    }
  }));

  console.log(`Public sales AI certification passed ${scenarios.length} cross-industry, two-turn scenarios.`);
} finally {
  for (const item of created) {
    await client.query(`delete from public.messaging_conversations where tenant_id=$1 and id=$2`, [item.tenantId, item.conversationId]);
  }
  await client.end();
}

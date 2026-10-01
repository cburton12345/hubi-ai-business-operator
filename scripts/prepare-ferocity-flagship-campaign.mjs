import fs from "node:fs";
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

loadLocalEnv();

const tenantId = "11111111-1111-4111-8111-111111111111";
const packageKey = "ferocity-flagship-proof-2026-09";
const client = new pg.Client({
  connectionString: required("DATABASE_URL"),
  ssl: { rejectUnauthorized: false }
});

const profile = {
  companyName: "Ferocity",
  websiteUrl: "https://ferocity.live",
  primaryEmail: "ferocityflow@outlook.com",
  brandVoice: "Direct, grounded, capable, human, and specific. Show real work moving; never use sci-fi language, inflated promises, fake proof, or generic AI hype.",
  idealCustomers: "Owners and operating teams who are constrained by disconnected people, software, follow-up, and unfinished work—especially service businesses that need growth without adding administrative drag.",
  services: [
    "Ferocity Earn: performance-aligned growth and recovery work",
    "Shared Business Brain and Ask Ferocity command experience",
    "AI workforce for lead response, calls, follow-up, estimating, scheduling, customer care, collections, and marketing",
    "Operations, field-team, finance, reporting, and approval coordination",
    "Ferocity Connect for approved business messaging through a paired Android device"
  ],
  offers: [
    "See Ferocity at work",
    "Start with Ferocity Earn when eligible—no subscription fee; Ferocity is paid from verified results under the published terms",
    "Choose a monthly operating-system plan for broader ongoing capabilities"
  ]
};

const campaignPrompt = `Create the flagship Ferocity product-proof campaign. The audience should feel the difference between another dashboard or collection of workflows and a coordinated business operating system.

Begin with the real constraint: a good business loses momentum when marketing pauses, calls interrupt the day, leads wait, estimates stall, schedules change, invoices age, and nobody has the whole picture. Do not make the owner look incompetent; the system is fragmented and the volume of unfinished work exceeds human attention.

Show one credible loop, using actual Ferocity product footage wherever possible: Ferocity identifies a growth opportunity and prepares an approved campaign; a lead arrives; the voice or messaging agent responds and qualifies; an estimate is prepared for approval; the job is scheduled and the field team is coordinated; completion evidence returns; invoicing and payment follow-up move forward; job economics update; approved proof becomes the next campaign. At the moments that matter, show Ferocity surfacing a decision rather than pretending everything is autonomous.

The operating idea is: Ferocity watches, the Business Brain understands, and the AI workforce relentlessly moves authorized work forward. The question underneath the story is, “What should happen next?” Do not put that sentence on every screen.

End with a grounded invitation: See what Ferocity can take off your plate. ferocity.live. Clearly disclose that the campaign was created using Ferocity’s marketing features and that final media rendering was completed through a connected provider. Do not claim unverified revenue, guaranteed outcomes, unlimited autonomy, universal provider support, or live publishing where approval/provider connection is still required.`;

const outputs = [
  {
    type: "landing_page",
    platform: "website",
    title: "The business does not need another dashboard",
    body: "Your business already has people, software, and workflows. The limit is the unfinished work between them. Ferocity gives your people and AI workforce one shared Business Brain—so marketing creates demand, conversations become estimates, jobs keep moving, payments get followed up, and every completed result can fuel the next opportunity. You stay in control of consequential decisions while Ferocity prepares or performs the work you authorize. See Ferocity at work."
  },
  {
    type: "ad_copy",
    platform: "multi_platform",
    title: "Your business should not wait for someone to remember",
    body: "Marketing stopped. A lead is waiting. An estimate stalled. An invoice was forgotten. Ferocity notices what changed, understands what it affects, and keeps the next authorized step moving across the business. See what Ferocity can take off your plate at ferocity.live."
  },
  {
    type: "facebook_post",
    platform: "facebook",
    title: "What happens after the lead comes in?",
    body: "Most software gives you another place to look. Ferocity helps the work move: respond, qualify, prepare the estimate, coordinate the job, follow up on payment, and turn approved proof into the next campaign. One Business Brain. One coordinated AI workforce. Real decisions still belong to you. See it at ferocity.live."
  },
  {
    type: "instagram_post",
    platform: "instagram",
    title: "A business that keeps moving",
    body: "The lead. The estimate. The schedule. The job. The payment. The next campaign. Ferocity connects the work between them—and brings you the decisions that actually need you. See Ferocity at work: ferocity.live."
  },
  {
    type: "tiktok_caption",
    platform: "tiktok",
    title: "Not another AI dashboard",
    body: "Watch one piece of work move from opportunity to customer to completed job to the next campaign. Ferocity keeps authorized work moving—and shows you where judgment is needed. ferocity.live"
  },
  {
    type: "email_campaign",
    platform: "email",
    title: "What if the work between your tools stopped getting lost?",
    body: "Ferocity is built for the work that usually waits for someone to notice. It connects awareness, memory, judgment, and an AI workforce across growth, sales, operations, field work, finance, and customer care. The result is not a longer task list. It is a business that keeps advancing, with approvals and human judgment where they belong. See the operating loop at ferocity.live."
  },
  {
    type: "email_campaign",
    platform: "founder_outreach",
    title: "Founder outreach — three-touch conversation starter",
    body: "Touch 1: I built Ferocity because business software kept giving owners more screens and workflows to manage. Ferocity is designed to notice unfinished work and move the next authorized step across the business. Would you be open to seeing one real operating loop?\n\nTouch 2: The useful part is not an AI chat window by itself. It is the shared context between marketing, calls, leads, estimates, jobs, payments, and the decisions that still need a person. Here is the walkthrough: ferocity.live/demo\n\nTouch 3: If a monthly platform feels like too much commitment, Ferocity Earn is the lower-risk path: eligible revenue actually collected determines the fee under the published terms. If it is not relevant, say so and I will close the loop."
  },
  {
    type: "email_campaign",
    platform: "lead_nurture",
    title: "Five-touch proof-led nurture sequence",
    body: "1. Show the invisible cost of unfinished work. 2. Demonstrate one opportunity moving across the operating loop. 3. Explain approval boundaries and why this is not uncontrolled automation. 4. Show the low-commitment Ferocity Earn path and the complete-plan path. 5. Invite the prospect to the Business Grader or a guided walkthrough. Every send requires consent, suppression checks, and approved channel readiness."
  },
  {
    type: "ad_copy",
    platform: "retargeting",
    title: "Retargeting concepts for visitors who did not start",
    body: "Angle A — You do not need another dashboard. See the system that watches the work between them. Angle B — Follow one lead from campaign to collected payment without losing context. Angle C — Not ready for another subscription? See whether Ferocity Earn is eligible. Angle D — Keep the decisions; let Ferocity prepare and move the authorized work. Never imply the visitor is being personally monitored or guarantee a result."
  }
];

const calendarItems = [
  [0, "Flagship story introduction", "facebook_post", "Publish only after the flagship claims and destination are approved."],
  [2, "The invisible cost of unfinished work", "facebook_post", "Use a grounded owner problem; do not blame the owner."],
  [4, "Business Grader invitation", "landing_page", "Primary lead magnet with source attribution."],
  [6, "Operating loop proof clip", "facebook_ad", "Use actual product footage; no fake product UI."],
  [8, "Founder outreach touch one", "lead_followup", "One-to-one outreach only; honor opt-out and relevance."],
  [10, "Why approvals make AI safer", "seo_blog", "Explain authority boundaries in plain language."],
  [12, "Ferocity Earn lower-commitment path", "facebook_post", "Use published eligibility and fee language exactly."],
  [15, "Founder outreach touch two", "lead_followup", "Link to the product-proof demo rather than a feature inventory."],
  [18, "From completed job to next campaign", "facebook_post", "Show the proof-to-growth loop and approval boundary."],
  [21, "Retargeting creative review", "facebook_ad", "Keep budget and live submission disabled until channel approval."],
  [24, "Founder outreach touch three", "lead_followup", "Close the loop respectfully if the prospect is not interested."],
  [27, "Thirty-day learning review", "recommendation", "Compare source, qualified leads, starts, paid conversion, support load, and contribution margin."]
];

const scenes = [
  { seconds: "0-7", title: "The invisible limit", proof: "Grounded owner/day footage plus concise overlays showing a paused campaign, waiting lead, stalled estimate, schedule change, and aging invoice.", narration: "The thing holding back a good business is rarely a lack of effort. It is all the work waiting between people, tools, and the next decision." },
  { seconds: "7-15", title: "Ferocity notices", proof: "Actual opportunity/attention view and Ask Ferocity prompt, with one real recommendation and its evidence.", narration: "Ferocity watches the business, remembers what happened, and works out what should happen next." },
  { seconds: "15-24", title: "Demand becomes a conversation", proof: "Actual Marketing OS draft, approved channel plan, inbound lead, and call or conversation timeline.", narration: "It can prepare the campaign, respond when interest arrives, and keep the conversation moving." },
  { seconds: "24-34", title: "Conversation becomes work", proof: "Actual lead, estimate, approval, schedule, dispatch, and field-team screens; show approval boundary before a consequential action.", narration: "It qualifies the opportunity, prepares the estimate, coordinates the job, and asks for judgment only where judgment belongs." },
  { seconds: "34-45", title: "Work becomes cash and understanding", proof: "Actual completion evidence, invoice, payment follow-up, job economics, and decision card.", narration: "When the work is done, Ferocity keeps billing and follow-up moving, updates the operating picture, and surfaces anything that needs attention." },
  { seconds: "45-54", title: "The result becomes growth", proof: "Actual approved job photos feeding a review request and new campaign draft. Do not show unapproved auto-publishing.", narration: "Then the completed result can become the proof, review, and next campaign that starts the loop again." },
  { seconds: "54-60", title: "The invitation", proof: "Clean Ferocity mark, ferocity.live, and concise creator disclosure.", narration: "That is Ferocity: one Business Brain and a coordinated AI workforce that keeps authorized work moving. See what it can take off your plate." }
];

await client.connect();
try {
  await client.query("begin");
  const brandResult = await client.query(
    `select id, name from public.brands where tenant_id = $1 and lower(name) = 'ferocity' and status = 'active' order by created_at limit 1`,
    [tenantId]
  );
  const brand = brandResult.rows[0];
  if (!brand?.id) throw new Error("The Internal Portfolio Ferocity brand was not found.");

  const profileResult = await client.query(
    `insert into public.marketing_os_business_profiles (
       tenant_id, brand_id, company_name, website_url, primary_email, brand_voice, ideal_customers,
       services_json, offers_json, source, status, last_refreshed_at, metadata_json
     ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, 'manual', 'ready', now(), $10::jsonb)
     on conflict (tenant_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid))
     do update set company_name = excluded.company_name, website_url = excluded.website_url,
       primary_email = excluded.primary_email, brand_voice = excluded.brand_voice,
       ideal_customers = excluded.ideal_customers, services_json = excluded.services_json,
       offers_json = excluded.offers_json, status = 'ready', last_refreshed_at = now(),
       metadata_json = public.marketing_os_business_profiles.metadata_json || excluded.metadata_json,
       updated_at = now()
     returning id`,
    [tenantId, brand.id, profile.companyName, profile.websiteUrl, profile.primaryEmail, profile.brandVoice,
      profile.idealCustomers, JSON.stringify(profile.services), JSON.stringify(profile.offers),
      JSON.stringify({ preparedBy: "ferocity_flagship_campaign", packageKey, factsRequireOwnerReview: true })]
  );
  const profileId = profileResult.rows[0].id;

  const existingCampaign = await client.query(
    `select id from public.content_studio_campaigns
      where tenant_id = $1 and brand_id = $2 and metadata_json->>'packageKey' = $3
      order by created_at desc limit 1`,
    [tenantId, brand.id, packageKey]
  );
  let campaignId = existingCampaign.rows[0]?.id;
  if (campaignId) {
    await client.query(
      `update public.content_studio_campaigns set profile_id = $3, prompt = $4,
        campaign_name = 'Ferocity flagship product-proof campaign',
        goal = 'Create belief by showing one truthful end-to-end operating loop.',
        status = 'needs_review', approval_required = true,
        metadata_json = metadata_json || $5::jsonb, updated_at = now()
       where tenant_id = $1 and id = $2`,
      [tenantId, campaignId, profileId, campaignPrompt,
        JSON.stringify({ packageKey, livePublishingEnabled: false, paidRenderingEnabled: false, ownerApprovalRequired: true })]
    );
    await client.query(`delete from public.content_studio_outputs where tenant_id = $1 and campaign_id = $2`, [tenantId, campaignId]);
  } else {
    const inserted = await client.query(
      `insert into public.content_studio_campaigns (
        tenant_id, brand_id, profile_id, prompt, campaign_name, goal, status, mode, approval_required, metadata_json
      ) values ($1, $2, $3, $4, 'Ferocity flagship product-proof campaign',
        'Create belief by showing one truthful end-to-end operating loop.', 'needs_review', 'advanced', true, $5::jsonb)
      returning id`,
      [tenantId, brand.id, profileId, campaignPrompt,
        JSON.stringify({ packageKey, livePublishingEnabled: false, paidRenderingEnabled: false, ownerApprovalRequired: true })]
    );
    campaignId = inserted.rows[0].id;
  }

  for (const output of outputs) {
    await client.query(
      `insert into public.content_studio_outputs (
        tenant_id, brand_id, campaign_id, output_type, platform, title, body, status, risk_level, metadata_json
      ) values ($1, $2, $3, $4, $5, $6, $7, 'needs_review', 'medium', $8::jsonb)`,
      [tenantId, brand.id, campaignId, output.type, output.platform, output.title, output.body,
        JSON.stringify({ packageKey, approvalRequired: true, providerSubmitted: false, paidSpend: false })]
    );
  }
  await client.query(
    `update public.content_studio_campaigns set output_count = $3, updated_at = now() where tenant_id = $1 and id = $2`,
    [tenantId, campaignId, outputs.length]
  );

  await client.query(
    `delete from public.marketing_calendar_items where tenant_id = $1 and brand_id = $2 and metadata_json->>'packageKey' = $3`,
    [tenantId, brand.id, packageKey]
  );
  for (const [dayOffset, title, itemType, notes] of calendarItems) {
    await client.query(
      `insert into public.marketing_calendar_items (
        tenant_id, brand_id, source_type, source_id, title, item_type, status,
        scheduled_for, risk_level, notes, metadata_json
      ) values ($1, $2, 'marketing_plan', $3, $4, $5, 'draft',
        date_trunc('day', now()) + ($6::int * interval '1 day') + interval '10 hours',
        'medium', $7, $8::jsonb)`,
      [tenantId, brand.id, campaignId, title, itemType, dayOffset, notes,
        JSON.stringify({ packageKey, approvalRequired: true, publishingEnabled: false, paidSpend: false })]
    );
  }

  const existingVideo = await client.query(
    `select id from public.marketing_video_jobs where tenant_id = $1 and brand_id = $2
      and metadata_json->>'packageKey' = $3 order by created_at desc limit 1`,
    [tenantId, brand.id, packageKey]
  );
  let videoJobId = existingVideo.rows[0]?.id;
  const videoMetadata = {
    packageKey,
    flagship: true,
    durationSeconds: 60,
    approvalRequired: true,
    noProviderSubmitted: true,
    paidRenderingEnabled: false,
    actualProductFootageRequired: true,
    noFakeProductUi: true,
    creatorDisclosure: "Created using Ferocity’s marketing features; final rendering completed through a connected video provider."
  };
  if (videoJobId) {
    await client.query(
      `update public.marketing_video_jobs set campaign_id = $3, provider_key = 'provider_not_selected',
        service_label = 'Ferocity flagship campaign', goal = $4, offer_label = 'See Ferocity at work',
        status = 'needs_review', script_text = $5, scenes_json = $6::jsonb, voiceover_text = $7,
        cta_text = 'See what Ferocity can take off your plate — ferocity.live',
        provider_request_json = $8::jsonb, history_json = $9::jsonb, metadata_json = $10::jsonb,
        output_url = null, error_message = null, updated_at = now()
       where tenant_id = $1 and id = $2`,
      [tenantId, videoJobId, campaignId,
        "A truthful 60-second flagship story showing one opportunity becoming work, cash, learning, and the next opportunity.",
        campaignPrompt, JSON.stringify(scenes), scenes.map((scene) => scene.narration).join(" "),
        JSON.stringify({ providerReady: false, assembly: "hybrid_product_capture_and_connected_renderer", aspectRatios: ["16:9", "9:16", "1:1", "4:5"], sourceClipRenders: 0 }),
        JSON.stringify([{ status: "prepared_for_review", at: new Date().toISOString(), note: "Flagship brief prepared inside Ferocity. No render, post, or spend occurred." }]),
        JSON.stringify(videoMetadata)]
    );
  } else {
    const insertedVideo = await client.query(
      `insert into public.marketing_video_jobs (
        tenant_id, brand_id, campaign_id, provider_key, service_label, goal, offer_label, status,
        script_text, scenes_json, voiceover_text, cta_text, provider_request_json, history_json, metadata_json
      ) values ($1, $2, $3, 'provider_not_selected', 'Ferocity flagship campaign', $4,
        'See Ferocity at work', 'needs_review', $5, $6::jsonb, $7,
        'See what Ferocity can take off your plate — ferocity.live', $8::jsonb, $9::jsonb, $10::jsonb)
      returning id`,
      [tenantId, brand.id, campaignId,
        "A truthful 60-second flagship story showing one opportunity becoming work, cash, learning, and the next opportunity.",
        campaignPrompt, JSON.stringify(scenes), scenes.map((scene) => scene.narration).join(" "),
        JSON.stringify({ providerReady: false, assembly: "hybrid_product_capture_and_connected_renderer", aspectRatios: ["16:9", "9:16", "1:1", "4:5"], sourceClipRenders: 0 }),
        JSON.stringify([{ status: "prepared_for_review", at: new Date().toISOString(), note: "Flagship brief prepared inside Ferocity. No render, post, or spend occurred." }]),
        JSON.stringify(videoMetadata)]
    );
    videoJobId = insertedVideo.rows[0].id;
  }

  await client.query(
    `delete from public.review_first_export_queue where tenant_id = $1 and source_table = 'marketing_video_jobs' and source_id = $2`,
    [tenantId, videoJobId]
  );
  await client.query(
    `insert into public.review_first_export_queue (
      tenant_id, brand_id, export_type, provider_key, target_label, title, body, status,
      risk_level, source_table, source_id, metadata_json
    ) values ($1, $2, 'ad_creative', 'manual_export', 'Website, Meta, TikTok, YouTube, email',
      'Review Ferocity flagship campaign before rendering or publishing', $3, 'needs_review', 'high',
      'marketing_video_jobs', $4, $5::jsonb)`,
    [tenantId, brand.id, campaignPrompt, videoJobId,
      JSON.stringify({ packageKey, approvalRequired: true, providerConnectionRequired: true, liveSpendEnabled: false })]
  );

  await client.query("commit");
  console.log(JSON.stringify({ tenantId, brandId: brand.id, profileId, campaignId, videoJobId, outputs: outputs.length, calendarItems: calendarItems.length, liveActions: false }, null, 2));
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}

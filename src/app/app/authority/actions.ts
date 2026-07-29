"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { makePublicToken } from "@/lib/ugc/proof";

const authorityStatusSchema = z.object({
  itemId: z.string().uuid(),
  table: z.enum(["authority_events", "authority_content_gaps", "authority_website_recommendations"]),
  status: z.string().trim().min(2).max(40)
});

type CompletedJobRow = {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  customer_id: string;
  title: string;
  service_area: string | null;
  completion_notes: string | null;
  dispatcher_notes: string | null;
  customer_name: string | null;
  customer_email: string | null;
  city: string | null;
  state: string | null;
};

function draftBody(kind: string, job: CompletedJobRow) {
  const location = [job.city, job.state].filter(Boolean).join(", ") || job.service_area || "the service area";
  const customer = job.customer_name || "the customer";
  const notes = job.completion_notes || job.dispatcher_notes || "Use approved job notes, photos, and customer proof before publishing.";

  if (kind === "case_study") {
    return `Case study draft\n\nProject: ${job.title}\nLocation: ${location}\nCustomer: ${customer}\n\nWhat happened:\n${notes}\n\nSections to complete before publishing:\n- Problem or need\n- Work completed\n- Materials and methods used\n- Result\n- Approved customer quote or proof\n- Photos/videos approved for marketing\n- Call to action\n\nDo not invent outcomes, savings, timelines, reviews, or customer quotes.`;
  }

  if (kind === "faq") {
    return `FAQ draft from ${job.title}\n\nQ: What should customers know about this type of project?\nA: Use the verified project details, customer questions, and job notes from this completed work. Keep the answer helpful, specific, and honest.\n\nQ: What affects timing or cost?\nA: Explain the real variables from this job only after the owner verifies them.\n\nQ: What should someone do next?\nA: Request an inspection, quote, or consultation.`;
  }

  if (kind === "gbp_post") {
    return `Google Business Profile post draft\n\nCompleted project: ${job.title}${location ? ` in ${location}` : ""}.\n\n${notes}\n\nAdd approved photos and confirm permission before posting.`;
  }

  if (kind === "facebook_post") {
    return `Social post draft\n\nAnother completed project: ${job.title}.\n\n${notes}\n\nUse approved before/after photos or customer proof if available. Keep claims simple and verified.`;
  }

  if (kind === "blog") {
    return `Blog outline\n\nTitle: What this ${job.title} project can teach customers\n\nOutline:\n- The situation\n- The work completed\n- Common customer questions\n- Mistakes to avoid\n- What to ask before hiring\n- Service-area call to action\n\nSource this article from real job notes, approved photos, and owner-reviewed facts.`;
  }

  if (kind === "service_page") {
    return `Service/location page improvement draft\n\nUse this completed project as proof for a relevant service or location page.\n\nRecommended additions:\n- Project proof block\n- Before/after gallery if approved\n- FAQ from the job\n- Internal link to related service page\n- Clear quote request CTA\n\nDo not publish until the page, location, and claims are reviewed.`;
  }

  if (kind === "video_script") {
    return `Short video script\n\nHook: See what went into this completed project.\nScene 1: Show the problem or before photo.\nScene 2: Show work in progress or materials.\nScene 3: Show finished result.\nVoiceover: ${notes}\nCTA: Request a quote or inspection.\n\nUse only approved photos/videos and verified job details.`;
  }

  return `Internal training note\n\nProject: ${job.title}\nCustomer: ${customer}\nLocation: ${location}\n\nWhat to preserve:\n${notes}\n\nAdd materials, methods, customer questions, lessons learned, and follow-up rules after review.`;
}

async function insertDraft(input: {
  workspaceId: string;
  brandId: string;
  job: CompletedJobRow;
  bundleId: string;
  contentType: string;
  title: string;
  body: string;
  riskLevel?: "low" | "medium" | "high";
}) {
  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.ai_drafts (tenant_id, brand_id, content_type, title, body, metadata_json, status, risk_level)
    values ($1, $2, $3, $4, $5, $6::jsonb, 'needs_review', $7)
    returning id
    `,
    [
      input.workspaceId,
      input.brandId,
      input.contentType,
      input.title,
      input.body,
      JSON.stringify({
        source: "authority_engine",
        bundleId: input.bundleId,
        jobId: input.job.id,
        customerId: input.job.customer_id,
        truthfulUseOnly: true
      }),
      input.riskLevel ?? "medium"
    ]
  );

  return result?.rows[0]?.id ?? null;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function asCount(value: unknown) {
  return Number(value ?? 0);
}

async function recordAuthoritySnapshot(workspaceId: string, brandId: string) {
  const result = await queryPostgres<Record<string, string>>(
    `
    select
      (select count(*) from public.service_jobs where tenant_id = $1 and status = 'completed')::text as completed_jobs,
      (
        select count(*)
        from public.service_jobs j
        where j.tenant_id = $1
          and j.status = 'completed'
          and not exists (
            select 1 from public.authority_content_bundles b
            where b.tenant_id = j.tenant_id and b.job_id = j.id and b.bundle_type = 'completed_job'
          )
      )::text as unprocessed_jobs,
      (select count(*) from public.ugc_submissions where tenant_id = $1)::text as proof_items,
      (select count(*) from public.ugc_submissions where tenant_id = $1 and status = 'approved')::text as approved_proof_items,
      (select count(*) from public.review_request_workflows where tenant_id = $1)::text as review_requests,
      (
        select count(*)
        from public.ai_drafts
        where tenant_id = $1
          and content_type in ('case_study','faq','blog','gbp_post','facebook_post','service_page','city_page','video_script','newsletter','internal_training_note','schema_markup','website_recommendation')
      )::text as content_drafts,
      (select count(*) from public.publishing_queue where tenant_id = $1 and queue_status in ('draft','needs_approval','approved','scheduled'))::text as publishing_queue,
      (select count(*) from public.authority_website_recommendations where tenant_id = $1 and status in ('open','drafted','approved'))::text as website_recommendations
    `,
    [workspaceId]
  );

  const row = result?.rows[0] ?? {};
  const completedJobs = asCount(row.completed_jobs);
  const unprocessedJobs = asCount(row.unprocessed_jobs);
  const proofItems = asCount(row.proof_items);
  const approvedProofItems = asCount(row.approved_proof_items);
  const reviewRequests = asCount(row.review_requests);
  const contentDrafts = asCount(row.content_drafts);
  const publishingQueue = asCount(row.publishing_queue);
  const websiteRecommendations = asCount(row.website_recommendations);

  const reviewScore = clampScore(reviewRequests * 10 + approvedProofItems * 8);
  const projectProofScore = clampScore(completedJobs * 6 + proofItems * 8 + approvedProofItems * 10);
  const contentScore = clampScore(contentDrafts * 5 + publishingQueue * 4);
  const websiteScore = clampScore(Math.max(0, 65 - websiteRecommendations * 8) + contentDrafts * 2);
  const consistencyScore = clampScore(completedJobs > 0 ? 50 + Math.min(40, contentDrafts * 3) - unprocessedJobs * 6 : 20);
  const score = clampScore((reviewScore + projectProofScore + contentScore + websiteScore + consistencyScore) / 5);
  const explanations = [
    `${completedJobs} completed jobs can become authority assets.`,
    `${proofItems} proof submissions and ${approvedProofItems} approved proof items support trust.`,
    `${contentDrafts} authority drafts and ${publishingQueue} publishing queue items are ready for review.`,
    `${reviewRequests} review workflows help build reputation.`
  ];
  const missingSignals = [
    unprocessedJobs > 0 ? `${unprocessedJobs} completed jobs still need authority bundles.` : null,
    proofItems === 0 ? "No project photos, testimonials, or proof submissions are recorded yet." : null,
    reviewRequests === 0 ? "No review request workflow is queued yet." : null,
    websiteRecommendations > 0 ? `${websiteRecommendations} website authority improvements are open.` : null,
    contentDrafts === 0 ? "No case studies, FAQs, blogs, posts, or video scripts are drafted yet." : null
  ].filter(Boolean);

  await queryPostgres(
    `
    insert into public.authority_score_snapshots (
      tenant_id, brand_id, score, review_score, project_proof_score, content_score, website_score, consistency_score,
      explanations_json, missing_signals_json, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)
    `,
    [
      workspaceId,
      brandId,
      score,
      reviewScore,
      projectProofScore,
      contentScore,
      websiteScore,
      consistencyScore,
      JSON.stringify(explanations),
      JSON.stringify(missingSignals),
      JSON.stringify({ source: "authority_engine", reason: "completed_job_processed" })
    ]
  );

  await queryPostgres(
    `
    insert into public.authority_events (
      tenant_id, brand_id, event_type, status, priority, title, summary, recommended_action, metadata_json
    )
    values ($1, $2, 'score_updated', 'completed', 'normal', $3, $4, $5, $6::jsonb)
    `,
    [
      workspaceId,
      brandId,
      `Authority score updated to ${score}`,
      `Reviews ${reviewScore}, proof ${projectProofScore}, content ${contentScore}, website ${websiteScore}, consistency ${consistencyScore}.`,
      "Keep processing completed jobs and approving proof-backed assets.",
      JSON.stringify({ source: "authority_engine", score })
    ]
  );
}

async function processCompletedJob(workspaceId: string, job: CompletedJobRow) {
  const brandId = job.brand_id ?? (await queryPostgres<{ id: string }>(
    "select id from public.brands where tenant_id = $1 and status = 'active' order by created_at asc limit 1",
    [workspaceId]
  ))?.rows[0]?.id;

  if (!brandId) return { processed: false, reason: "No brand exists for this workspace." };

  const bundle = await queryPostgres<{ id: string }>(
    `
    insert into public.authority_content_bundles (
      tenant_id, brand_id, job_id, customer_id, status, bundle_type, title, summary, metadata_json
    )
    values ($1, $2, $3, $4, 'needs_review', 'completed_job', $5, $6, $7::jsonb)
    on conflict (tenant_id, job_id, bundle_type) do nothing
    returning id
    `,
    [
      workspaceId,
      brandId,
      job.id,
      job.customer_id,
      `Authority bundle: ${job.title}`,
      `Real completed job ready to become proof, review request, case study, FAQ, posts, website improvements, and training notes.`,
      JSON.stringify({ source: "completed_job_scan" })
    ]
  );

  const bundleId = bundle?.rows[0]?.id;
  if (!bundleId) return { processed: false, reason: "Already processed." };

  const draftSpecs = [
    ["case_study", `Case study: ${job.title}`],
    ["faq", `FAQ from ${job.title}`],
    ["gbp_post", `GBP post: ${job.title}`],
    ["facebook_post", `Social post: ${job.title}`],
    ["blog", `Blog outline: ${job.title}`],
    ["service_page", `Service page improvement: ${job.title}`],
    ["video_script", `Short video script: ${job.title}`],
    ["internal_training_note", `Training note: ${job.title}`]
  ] as const;

  const draftIds: Array<{ id: string; type: string }> = [];
  for (const [contentType, title] of draftSpecs) {
    const id = await insertDraft({
      workspaceId,
      brandId,
      job,
      bundleId,
      contentType,
      title,
      body: draftBody(contentType, job),
      riskLevel: contentType === "case_study" || contentType === "service_page" ? "medium" : "low"
    });
    if (id) draftIds.push({ id, type: contentType });
  }

  const proofToken = makePublicToken();
  await queryPostgres(
    `
    insert into public.ugc_capture_requests (
      tenant_id, brand_id, customer_id, job_id, public_token, request_type, status, metadata_json
    )
    select $1, $2, $3, $4, $5, 'before_after', 'ready', $6::jsonb
    where not exists (
      select 1 from public.ugc_capture_requests
      where tenant_id = $1 and job_id = $4 and request_type in ('before_after','job_proof','testimonial')
    )
    `,
    [
      workspaceId,
      brandId,
      job.customer_id,
      job.id,
      proofToken,
      JSON.stringify({ source: "authority_engine", bundleId })
    ]
  );

  await queryPostgres(
    `
    insert into public.review_request_workflows (
      tenant_id, brand_id, customer_id, job_id, trigger_event, channel, status, scheduled_for, ai_response_draft, metadata_json
    )
    select $1, $2, $3, $4, 'job_completed', 'manual', 'draft', now() + interval '1 day', $5, $6::jsonb
    where not exists (
      select 1 from public.review_request_workflows
      where tenant_id = $1 and job_id = $4 and trigger_event = 'job_completed'
    )
    `,
    [
      workspaceId,
      brandId,
      job.customer_id,
      job.id,
      `Hi ${job.customer_name || "there"}, thank you for letting us help with ${job.title}. If everything looks good, we would appreciate a quick review. Please reply first if anything needs attention.`,
      JSON.stringify({ source: "authority_engine", bundleId })
    ]
  );

  for (const draft of draftIds.filter((item) => ["gbp_post", "facebook_post", "blog", "service_page"].includes(item.type))) {
    const platform = draft.type === "gbp_post"
      ? "google_business_profile"
      : draft.type === "facebook_post"
        ? "facebook"
        : "website";

    await queryPostgres(
      `
      insert into public.publishing_queue (
        tenant_id, brand_id, draft_id, target_platform, provider_status, queue_status, metadata_json
      )
      values ($1, $2, $3, $4, 'not_connected', 'needs_approval', $5::jsonb)
      `,
      [
        workspaceId,
        brandId,
        draft.id,
        platform,
        JSON.stringify({ source: "authority_engine", bundleId, livePublishingGated: true })
      ]
    );
  }

  await queryPostgres(
    `
    insert into public.authority_knowledge_articles (
      tenant_id, brand_id, job_id, customer_id, article_type, status, title, body, methods_json, lessons_json, metadata_json
    )
    values ($1, $2, $3, $4, 'project', 'needs_review', $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
    `,
    [
      workspaceId,
      brandId,
      job.id,
      job.customer_id,
      `Project knowledge: ${job.title}`,
      draftBody("internal_training_note", job),
      JSON.stringify([]),
      JSON.stringify(["Review materials, timeline, customer questions, photos, and lessons before AI reuses this."]),
      JSON.stringify({ source: "authority_engine", bundleId })
    ]
  );

  const gaps = [
    ["faq", `Add FAQ from ${job.title}`, "Customers and AI systems need clear answers based on real work."],
    ["proof", `Add approved proof for ${job.title}`, "Photos, videos, and customer proof make the business more trustworthy."],
    ["internal_link", `Link ${job.title} proof to a service or city page`, "Internal links help real projects support the right services and locations."],
    ["video", `Create a short video from ${job.title}`, "Short videos can turn completed work into useful proof for social and ads."]
  ] as const;

  for (const [gapType, title, why] of gaps) {
    await queryPostgres(
      `
      insert into public.authority_content_gaps (
        tenant_id, brand_id, gap_type, status, priority, title, why_it_matters, recommended_asset, source_table, source_id, metadata_json
      )
      values ($1, $2, $3, 'open', 'normal', $4, $5, $6, 'service_jobs', $7, $8::jsonb)
      `,
      [workspaceId, brandId, gapType, title, why, title, job.id, JSON.stringify({ source: "authority_engine", bundleId })]
    );
  }

  await queryPostgres(
    `
    insert into public.authority_website_recommendations (
      tenant_id, brand_id, recommendation_type, status, priority, title, recommendation, metadata_json
    )
    values ($1, $2, 'media', 'open', 'normal', $3, $4, $5::jsonb)
    `,
    [
      workspaceId,
      brandId,
      `Use ${job.title} as proof on the website`,
      "Add approved photos, a short project summary, FAQ, and a quote request call-to-action to the relevant service or location page.",
      JSON.stringify({ source: "authority_engine", jobId: job.id, bundleId })
    ]
  );

  await queryPostgres(
    `
    insert into public.authority_events (
      tenant_id, brand_id, job_id, customer_id, event_type, status, priority, title, summary, recommended_action, source_table, source_id, metadata_json
    )
    values
      ($1, $2, $3, $4, 'job_completed', 'needs_review', 'high', $5, $6, 'Review the proof request, content drafts, review request, and publishing queue before anything goes public.', 'service_jobs', $3, $7::jsonb),
      ($1, $2, $3, $4, 'proof_needed', 'open', 'normal', $8, 'Ask for customer photos, testimonial, and before/after permission.', 'Send or copy the proof request link after checking customer consent rules.', 'ugc_capture_requests', null, $7::jsonb),
      ($1, $2, $3, $4, 'review_requested', 'open', 'normal', $9, 'Review request workflow prepared after completed work.', 'Review customer satisfaction first, then send the request manually or through a connected provider.', 'review_request_workflows', null, $7::jsonb)
    `,
    [
      workspaceId,
      brandId,
      job.id,
      job.customer_id,
      `Authority bundle ready: ${job.title}`,
      `${draftIds.length} content drafts, proof request, review request, website recommendation, and publishing queue entries were prepared.`,
      JSON.stringify({ source: "authority_engine", bundleId, draftCount: draftIds.length }),
      `Proof needed: ${job.title}`,
      `Review request ready: ${job.title}`
    ]
  );

  await queryPostgres(
    `
    update public.authority_content_bundles
    set draft_count = $3,
        queue_count = (select count(*) from public.publishing_queue where tenant_id = $1 and metadata_json->>'bundleId' = $2),
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [workspaceId, bundleId, draftIds.length]
  );

  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id, brand_id, event_family, event_type, title, body, primary_entity_type, primary_entity_id,
      source_table, source_id, metadata_json
    )
    values ($1, $2, 'content', 'authority_bundle_prepared', $3, $4, 'authority_content_bundle', $5, 'authority_content_bundles', $5, $6::jsonb)
    `,
    [
      workspaceId,
      brandId,
      `Authority bundle prepared: ${job.title}`,
      `${draftIds.length} review-ready assets, proof request, review workflow, and publishing queue items were prepared from a completed job.`,
      bundleId,
      JSON.stringify({ source: "authority_engine", bundleId, jobId: job.id, requiresApproval: true })
    ]
  );

  await recordAuthoritySnapshot(workspaceId, brandId);

  return { processed: true, reason: "Authority bundle created." };
}

export async function processCompletedJobsForAuthorityAction() {
  const workspaceId = await getCurrentWorkspaceId();
  const jobs = await queryPostgres<CompletedJobRow>(
    `
    select j.id, j.tenant_id, j.brand_id, j.customer_id, j.title, j.service_area, j.completion_notes,
           j.dispatcher_notes, c.name as customer_name, c.email as customer_email, c.city, c.state
    from public.service_jobs j
    join public.customers c on c.id = j.customer_id and c.tenant_id = j.tenant_id
    where j.tenant_id = $1
      and j.status = 'completed'
      and not exists (
        select 1 from public.authority_content_bundles b
        where b.tenant_id = j.tenant_id and b.job_id = j.id and b.bundle_type = 'completed_job'
      )
    order by j.updated_at desc
    limit 10
    `,
    [workspaceId]
  );

  for (const job of jobs?.rows ?? []) {
    await processCompletedJob(workspaceId, job);
  }

  revalidatePath("/app/authority");
  revalidatePath("/app/proof");
  revalidatePath("/app/review");
  revalidatePath("/app/publishing-hub");
  revalidatePath("/app/marketing-os");
}

export async function processSingleJobForAuthorityAction(formData: FormData) {
  const workspaceId = await getCurrentWorkspaceId();
  const jobId = formData.get("jobId")?.toString();
  if (!jobId) return;

  const jobResult = await queryPostgres<CompletedJobRow>(
    `
    select j.id, j.tenant_id, j.brand_id, j.customer_id, j.title, j.service_area, j.completion_notes,
           j.dispatcher_notes, c.name as customer_name, c.email as customer_email, c.city, c.state
    from public.service_jobs j
    join public.customers c on c.id = j.customer_id and c.tenant_id = j.tenant_id
    where j.tenant_id = $1 and j.id = $2 and j.status = 'completed'
    limit 1
    `,
    [workspaceId, jobId]
  );

  const job = jobResult?.rows[0];
  if (job) {
    await processCompletedJob(workspaceId, job);
  }

  revalidatePath("/app/authority");
  revalidatePath(`/app/service/jobs/${jobId}`);
  revalidatePath("/app/proof");
  revalidatePath("/app/review");
  revalidatePath("/app/publishing-hub");
}

export async function updateAuthorityItemStatusAction(formData: FormData) {
  const parsed = authorityStatusSchema.safeParse({
    itemId: formData.get("itemId"),
    table: formData.get("table"),
    status: formData.get("status")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const allowed: Record<string, Set<string>> = {
    authority_events: new Set(["open", "in_progress", "needs_review", "approved", "completed", "dismissed", "blocked"]),
    authority_content_gaps: new Set(["open", "planned", "drafted", "approved", "published", "dismissed"]),
    authority_website_recommendations: new Set(["open", "drafted", "approved", "published", "dismissed"])
  };
  if (!allowed[parsed.data.table]?.has(parsed.data.status)) return;

  if (parsed.data.table === "authority_events") {
    await queryPostgres(
      `
      update public.authority_events
      set status = $3,
          completed_at = case when $3 in ('completed','dismissed') then now() else completed_at end,
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [workspaceId, parsed.data.itemId, parsed.data.status]
    );
  } else if (parsed.data.table === "authority_content_gaps") {
    await queryPostgres(
      `
      update public.authority_content_gaps
      set status = $3,
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [workspaceId, parsed.data.itemId, parsed.data.status]
    );
  } else {
    await queryPostgres(
      `
      update public.authority_website_recommendations
      set status = $3,
          updated_at = now()
      where tenant_id = $1 and id = $2
      `,
      [workspaceId, parsed.data.itemId, parsed.data.status]
    );
  }

  revalidatePath("/app/authority");
}

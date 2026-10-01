import { createHash } from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";
import { activateSeoTrafficEngine } from "@/lib/seo/seo-autopilot";
import { answerEngineFindings, coreMarketingPlaybooks, scoreMarketingOpportunity, translateOwnerGrowthGoal } from "./marketing-intelligence";

function json(value: unknown) {
  return JSON.stringify(value ?? null);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function ensureCoreMarketingPlaybooks(tenantId: string) {
  let ensured = 0;
  for (const definition of coreMarketingPlaybooks) {
    const playbook = await queryPostgres<{ id: string; current_version: number }>(
      `insert into public.marketing_playbooks (tenant_id,playbook_key,name,purpose,category,status,current_version,metadata_json)
       values ($1,$2,$3,$4,$5,'active',1,'{"systemManaged":true}'::jsonb)
       on conflict (tenant_id,playbook_key) do update set name=excluded.name,purpose=excluded.purpose,category=excluded.category,updated_at=now()
       returning id,current_version`,
      [tenantId, definition.key, definition.name, definition.purpose, definition.category]
    );
    const playbookId = playbook?.rows[0]?.id;
    if (!playbookId) continue;
    const currentVersion = playbook.rows[0].current_version;
    const existing = await queryPostgres<{
      required_context_json: unknown; workflow_json: unknown; decision_rules_json: unknown; outputs_json: unknown;
      quality_checks_json: unknown; success_metrics_json: unknown; permissions_json: unknown;
    }>(
      `select required_context_json,workflow_json,decision_rules_json,outputs_json,quality_checks_json,success_metrics_json,permissions_json
         from public.marketing_playbook_versions where tenant_id=$1 and playbook_id=$2 and version=$3 limit 1`,
      [tenantId, playbookId, currentVersion]
    );
    const nextContract = {
      requiredContext: definition.requiredContext, workflow: definition.workflow, decisionRules: definition.decisionRules,
      outputs: definition.outputs, qualityChecks: definition.qualityChecks, successMetrics: definition.successMetrics,
      permissions: definition.permissions
    };
    const prior = existing?.rows[0];
    const priorContract = prior ? {
      requiredContext: prior.required_context_json, workflow: prior.workflow_json, decisionRules: prior.decision_rules_json,
      outputs: prior.outputs_json, qualityChecks: prior.quality_checks_json, successMetrics: prior.success_metrics_json,
      permissions: prior.permissions_json
    } : null;
    if (priorContract && stableJson(priorContract) === stableJson(nextContract)) {
      ensured += 1;
      continue;
    }
    const version = prior ? currentVersion + 1 : currentVersion;
    await queryPostgres(
      `insert into public.marketing_playbook_versions
        (tenant_id,playbook_id,version,required_context_json,workflow_json,decision_rules_json,outputs_json,quality_checks_json,success_metrics_json,permissions_json,status)
       values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,'active')
       on conflict (tenant_id,playbook_id,version) do nothing`,
      [tenantId, playbookId, version, json(definition.requiredContext), json(definition.workflow), json(definition.decisionRules), json(definition.outputs), json(definition.qualityChecks), json(definition.successMetrics), json(definition.permissions)]
    );
    await queryPostgres(
      `update public.marketing_playbooks set current_version=$3,updated_at=now() where tenant_id=$1 and id=$2`,
      [tenantId, playbookId, version]
    );
    ensured += 1;
  }
  return ensured;
}

export async function syncSharedMarketingBrain(tenantId: string, brandId: string) {
  const [brand, profile, services, areas, icps, offers, memory, voc, proof, outcomes] = await Promise.all([
    queryPostgres(`select id,name,industry,vertical,business_model,description,primary_goal,primary_location,phone,domain from public.brands where tenant_id=$1 and id=$2 limit 1`, [tenantId, brandId]),
    queryPostgres(`select company_name,website_url,brand_voice,ideal_customers,services_json,service_areas_json,offers_json,reviews_json,audience_json,positioning_json,proof_json,marketing_rules_json from public.marketing_os_business_profiles where tenant_id=$1 and brand_id=$2 and status <> 'archived' limit 1`, [tenantId, brandId]),
    queryPostgres(`select id,name,description,priority from public.brand_services where tenant_id=$1 and brand_id=$2 and active=true order by priority desc,name limit 100`, [tenantId, brandId]),
    queryPostgres(`select id,city,state,service_area_name,priority from public.brand_locations where tenant_id=$1 and brand_id=$2 and active=true order by priority desc limit 100`, [tenantId, brandId]),
    queryPostgres(`select name,customer_type,geography_json,pains_json,desired_outcomes_json,buying_triggers_json,objections_json,disqualifiers_json,confidence_score,sample_size,last_validated_at from public.growth_icp_profiles where tenant_id=$1 and brand_id=$2 and status='active' order by confidence_score desc`, [tenantId, brandId]),
    queryPostgres(`select offer_key,version,name,promise,mechanism,included_json,exclusions_json,proof_requirements_json,price_floor_cents,price_ceiling_cents,minimum_margin_bps,status from public.growth_offers where tenant_id=$1 and brand_id=$2 and status in ('active','testing') order by updated_at desc`, [tenantId, brandId]),
    queryPostgres(`select memory_type,title,summary,score,confidence_score,evidence_json,last_observed_at from public.marketing_memory_items where tenant_id=$1 and brand_id=$2 and status <> 'archived' and (expires_at is null or expires_at>now()) order by confidence_score desc,score desc limit 150`, [tenantId, brandId]),
    queryPostgres(`select source_type,signal_type,normalized_summary,tags,confidence_score,evidence_json,observed_at from public.growth_voc_signals where tenant_id=$1 and brand_id=$2 and review_status in ('learning','verified') and (expires_at is null or expires_at>now()) order by confidence_score desc,observed_at desc limit 100`, [tenantId, brandId]),
    queryPostgres(`select asset.id,coalesce(submission.title,asset.caption,asset.original_filename) as title,asset.asset_type,submission.permission_marketing,asset.metadata_json
      from public.ugc_assets asset join public.ugc_submissions submission on submission.id=asset.submission_id and submission.tenant_id=asset.tenant_id
      where asset.tenant_id=$1 and asset.brand_id=$2 and submission.permission_marketing=true and submission.status='approved' and asset.status='approved'
      order by asset.updated_at desc limit 50`, [tenantId, brandId]),
    queryPostgres(`select original_source,latest_source,sum(collected_cents)::bigint as collected_cents,sum(gross_profit_cents)::bigint as gross_profit_cents,count(*)::int as outcomes from public.revenue_attribution_records where tenant_id=$1 and brand_id=$2 and occurred_at>=now()-interval '365 days' group by original_source,latest_source order by gross_profit_cents desc nulls last limit 100`, [tenantId, brandId])
  ]);
  const missing: string[] = [];
  if (!profile?.rows[0]) missing.push("marketing_profile");
  if (!(services?.rows.length ?? 0)) missing.push("services");
  if (!(areas?.rows.length ?? 0)) missing.push("geography");
  if (!(icps?.rows.length ?? 0)) missing.push("icp");
  if (!(offers?.rows.length ?? 0)) missing.push("offers");
  if (!(proof?.rows.length ?? 0)) missing.push("approved_proof");
  if (!(outcomes?.rows.length ?? 0)) missing.push("revenue_profit_outcomes");
  const truth = {
    brand: brand?.rows[0] ?? null,
    marketingProfile: profile?.rows[0] ?? null,
    services: services?.rows ?? [], geography: areas?.rows ?? [], icps: icps?.rows ?? [], offers: offers?.rows ?? [],
    learnedMessaging: memory?.rows ?? [], voiceOfCustomer: voc?.rows ?? [], approvedProof: proof?.rows ?? [], businessOutcomes: outcomes?.rows ?? []
  };
  const confidence = Math.round(((9 - missing.length) / 9) * 100);
  const saved = await queryPostgres<{ id: string; version: number }>(
    `insert into public.marketing_brain_snapshots (tenant_id,brand_id,version,truth_json,source_freshness_json,missing_context_json,confidence_score)
     select $1,$2,coalesce(max(version),0)+1,$3::jsonb,$4::jsonb,$5::jsonb,$6 from public.marketing_brain_snapshots where tenant_id=$1 and brand_id=$2 returning id,version`,
    [tenantId, brandId, json(truth), json({ generatedAt: new Date().toISOString(), sources: ["business_brain","marketing_os","growth_memory","voc","proof","revenue_attribution"] }), json(missing), confidence]
  );
  return { id: saved?.rows[0]?.id ?? null, version: saved?.rows[0]?.version ?? 0, confidence, missing, truth };
}

export async function seedRepresentativeAiSearchQuestions(tenantId: string, brandId: string) {
  const [brandResult, servicesResult, areaResult] = await Promise.all([
    queryPostgres<{ name: string }>(`select name from public.brands where tenant_id=$1 and id=$2 limit 1`, [tenantId, brandId]),
    queryPostgres<{ name: string }>(`select name from public.brand_services where tenant_id=$1 and brand_id=$2 and active=true order by priority desc limit 5`, [tenantId, brandId]),
    queryPostgres<{ label: string }>(`select concat_ws(', ',nullif(city,''),nullif(state,''),nullif(service_area_name,'')) as label from public.brand_locations where tenant_id=$1 and brand_id=$2 and active=true order by priority desc limit 3`, [tenantId, brandId])
  ]);
  const brandName = brandResult?.rows[0]?.name;
  if (!brandName) return 0;
  const services = (servicesResult?.rows ?? []).map((row) => row.name);
  const areas = (areaResult?.rows ?? []).map((row) => row.label).filter(Boolean);
  if (!services.length) services.push("the business's core service");
  if (!areas.length) areas.push("the business's service area");
  const platforms = ["chatgpt", "gemini", "perplexity", "google_ai_overviews"];
  const questions = services.flatMap((service) => areas.slice(0, 2).flatMap((area) => [
    { classKey: "recommendation", text: `Which businesses are good options for ${service} in ${area}?` },
    { classKey: "comparison", text: `How should I compare ${service} providers in ${area}?` },
    { classKey: "problem_solution", text: `Who can help solve a ${service} problem near ${area}?` },
    { classKey: "brand_fact", text: `What services does ${brandName} provide and where do they operate?` }
  ]));
  let created = 0;
  for (const platform of platforms) for (const question of questions.slice(0, 40)) {
    const result = await queryPostgres(
      `insert into public.ai_search_visibility_checks
        (tenant_id,brand_id,platform_key,check_name,query_text,status,next_check_at,question_class,service_focus,geography_text,cadence_days,metadata_json)
       values ($1,$2,$3,$4,$5,'manual_check',now(),$6,$7,$8,30,$9::jsonb)
       on conflict (tenant_id,brand_id,platform_key,query_text) do update set question_class=excluded.question_class,
         service_focus=excluded.service_focus,geography_text=excluded.geography_text,cadence_days=excluded.cadence_days,updated_at=now()`,
      [tenantId, brandId, platform, `${platform.replaceAll("_", " ")} ${question.classKey}`, question.text, question.classKey,
        services.find((service) => question.text.includes(service)) ?? null, areas.find((area) => question.text.includes(area)) ?? null,
        json({ representativeQuestion: true, noVisibilityClaimWithoutObservation: true })]
    );
    created += Number(result?.rowCount ?? 0);
  }
  return created;
}

export async function recordAiSearchObservation(input: {
  tenantId: string; brandId: string; checkId: string; providerKey: string; businessMentioned: boolean | null;
  description?: string | null; competitors?: string[]; citations?: Array<{ url?: string; title?: string }>;
  inaccuracies?: string[]; contentGaps?: string[]; rawResponse?: string; status?: "observed" | "needs_review" | "provider_unavailable" | "failed";
}) {
  const check = await queryPostgres<{ query_text: string; service_focus: string | null; geography_text: string | null }>(
    `select query_text,service_focus,geography_text from public.ai_search_visibility_checks where tenant_id=$1 and id=$2 and brand_id=$3 limit 1`,
    [input.tenantId, input.checkId, input.brandId]
  );
  if (!check?.rows[0]) throw new Error("AI search visibility check not found for this brand.");
  const findings = answerEngineFindings({ businessMentioned: input.businessMentioned, description: input.description, citations: input.citations, inaccuracies: input.inaccuracies, competitors: input.competitors });
  const observation = await queryPostgres<{ id: string }>(
    `insert into public.ai_search_visibility_observations
      (tenant_id,brand_id,visibility_check_id,provider_key,status,business_mentioned,description_text,competitor_mentions_json,citations_json,inaccuracies_json,content_gaps_json,raw_response_hash,metadata_json)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13::jsonb) returning id`,
    [input.tenantId, input.brandId, input.checkId, input.providerKey, input.status ?? "observed", input.businessMentioned, input.description ?? null,
      json(input.competitors ?? []), json(input.citations ?? []), json(input.inaccuracies ?? []), json(input.contentGaps ?? []),
      input.rawResponse ? createHash("sha256").update(input.rawResponse).digest("hex") : null, json({ findings })]
  );
  const observationId = observation?.rows[0]?.id;
  if (observationId) {
    await queryPostgres(
      `update public.ai_search_visibility_checks set latest_observation_id=$3,status=case when $4 then 'needs_work' else 'checked' end,
       result_summary=$5,last_checked_at=now(),next_check_at=now()+(cadence_days*interval '1 day'),updated_at=now() where tenant_id=$1 and id=$2`,
      [input.tenantId, input.checkId, observationId, findings.length > 0, input.description?.slice(0, 2000) ?? null]
    );
    if (findings.length > 0) {
      const visibilityCheck = check.rows[0];
      await queryPostgres(
        `insert into public.marketing_campaign_recommendations
          (tenant_id,brand_id,recommendation_key,title,trigger_reason,primary_goal,recommended_channels,recommended_outputs_json,
           expected_impact,difficulty,priority_score,status,source_signals_json,metadata_json)
         values ($1,$2,$3,$4,$5,'improve_ai_search_visibility',array['website','seo'], $6::jsonb,
           'Improve accurate, source-backed visibility for a representative customer question.','medium',$7,'needs_review',$8::jsonb,$9::jsonb)
         on conflict (tenant_id,brand_id,recommendation_key) do update set title=excluded.title,trigger_reason=excluded.trigger_reason,
           recommended_outputs_json=excluded.recommended_outputs_json,priority_score=excluded.priority_score,status='needs_review',
           source_signals_json=excluded.source_signals_json,metadata_json=excluded.metadata_json,updated_at=now()`,
        [input.tenantId, input.brandId, `ai-search-observation:${input.checkId}`, `Close an AI-search visibility gap for: ${visibilityCheck.query_text}`.slice(0, 240),
          findings.map((finding) => finding.reason).join(" ").slice(0, 2000), json(findings), Math.min(95, 60 + findings.length * 7),
          json({ observationId, citations: input.citations ?? [], rawResponseStored: false }),
          json({ generatedBy: "ai_search_visibility", approvalRequired: true, noFabricatedVisibilityClaims: true })]
      );
      await queryPostgres(
        `insert into public.seo_content_strategy_items
          (tenant_id,brand_id,strategy_name,content_type,title,target_prompt,service_focus,city_focus,publish_target,status,priority_score,metadata_json)
         select $1,$2,'AI search visibility','faq',$3,$4,$5,$6,'review_queue','planned',$7,$8::jsonb
         where not exists (
           select 1 from public.seo_content_strategy_items where tenant_id=$1 and brand_id=$2
             and metadata_json->>'visibilityCheckId'=$9 and status not in ('done','paused')
         )`,
        [input.tenantId, input.brandId, `Create a source-backed answer for: ${visibilityCheck.query_text}`.slice(0, 240), visibilityCheck.query_text,
          visibilityCheck.service_focus, visibilityCheck.geography_text, Math.min(95, 60 + findings.length * 7),
          json({ visibilityCheckId: input.checkId, observationId, findings, requiresFactReview: true }), input.checkId]
      );
    }
  }
  return { observationId: observationId ?? null, findings };
}

export async function composeMarketingPlaybookRuns(input: {
  tenantId: string;
  brandId: string;
  playbookKeys: string[];
  idempotencyPrefix: string;
  objectiveId?: string | null;
  context?: Record<string, unknown>;
}) {
  const rows = await queryPostgres<{
    playbook_key: string;
    version_id: string;
    version: number;
    workflow_json: unknown[];
    permissions_json: Record<string, unknown>;
  }>(
    `select playbook.playbook_key,version.id as version_id,version.version,version.workflow_json,version.permissions_json
       from public.marketing_playbooks playbook
       join public.marketing_playbook_versions version on version.playbook_id=playbook.id and version.tenant_id=playbook.tenant_id
      where playbook.tenant_id=$1 and playbook.status='active' and version.status='active'
        and version.version=playbook.current_version and playbook.playbook_key=any($2::text[])`,
    [input.tenantId, input.playbookKeys]
  );
  const runIds: string[] = [];
  for (const row of rows?.rows ?? []) {
    const run = await queryPostgres<{ id: string }>(
      `insert into public.marketing_playbook_runs
        (tenant_id,brand_id,objective_id,playbook_version_id,status,input_snapshot_json,plan_json,idempotency_key)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
       on conflict (tenant_id,idempotency_key) do update set input_snapshot_json=excluded.input_snapshot_json,
         plan_json=excluded.plan_json,updated_at=now() returning id`,
      [input.tenantId, input.brandId, input.objectiveId ?? null, row.version_id, "planned",
        json({ ...(input.context ?? {}), playbookKey: row.playbook_key, playbookVersion: row.version, permissions: row.permissions_json }), json(row.workflow_json),
        `${input.idempotencyPrefix}:${row.playbook_key}:v${row.version}`]
    );
    if (run?.rows[0]?.id) runIds.push(run.rows[0].id);
  }
  return runIds;
}

export async function rescoreGrowthOpportunities(tenantId: string) {
  const result = await queryPostgres<{
    id: string; intent_score: number; geography_score: number; objective_score: number; risk_flags: string[]; metadata_json: Record<string, unknown>;
  }>(`select id,intent_score,geography_score,objective_score,risk_flags,metadata_json from public.growth_opportunities where tenant_id=$1 and status in ('detected','needs_review','approved','queued') order by detected_at desc limit 500`, [tenantId]);
  for (const row of result?.rows ?? []) {
    const score = scoreMarketingOpportunity({
      impact: row.objective_score || row.intent_score,
      relevance: Math.round((row.intent_score + row.geography_score) / 2),
      effort: Number(row.metadata_json?.effortScore ?? 50),
      confidence: Number(row.metadata_json?.confidenceScore ?? Math.round((row.intent_score + row.geography_score + row.objective_score) / 3)),
      urgency: Number(row.metadata_json?.urgencyScore ?? (row.intent_score >= 80 ? 80 : 50))
    });
    await queryPostgres(
      `update public.growth_opportunities set impact_score=$3,relevance_score=$4,effort_score=$5,confidence_score=$6,
       urgency_score=$7,business_value_score=$8,recommended_playbook_key=coalesce(recommended_playbook_key,'closed_loop_growth'),
       overall_score=$8,updated_at=now() where tenant_id=$1 and id=$2`,
      [tenantId, row.id, score.impact, score.relevance, score.effort, score.confidence, score.urgency, score.score]
    );
  }
  return result?.rows.length ?? 0;
}

export async function refreshGrowthValueAttribution(tenantId: string) {
  const result = await queryPostgres(
    `update public.growth_attribution_touches touch set
       qualified=coalesce((select lead.qualification_status='qualified' or lead.status in ('qualified','won') from public.leads lead where lead.tenant_id=touch.tenant_id and lead.id=touch.lead_id),touch.qualified),
       booked=touch.job_id is not null,
       work_completed=coalesce((select job.status='completed' from public.service_jobs job where job.tenant_id=touch.tenant_id and job.id=touch.job_id),false),
       collected_revenue_cents=coalesce((select sum(record.collected_cents)::int from public.revenue_attribution_records record where record.tenant_id=touch.tenant_id and (record.lead_id=touch.lead_id or record.job_id=touch.job_id or record.invoice_id=touch.invoice_id)),0),
       gross_profit_cents=(select sum(record.gross_profit_cents)::int from public.revenue_attribution_records record where record.tenant_id=touch.tenant_id and (record.lead_id=touch.lead_id or record.job_id=touch.job_id or record.invoice_id=touch.invoice_id)),
       review_created=exists(select 1 from public.review_request_workflows review where review.tenant_id=touch.tenant_id and (review.job_id=touch.job_id or review.customer_id=touch.customer_id)),
       repeat_customer=case when touch.customer_id is null then false else (select count(*)>1 from public.service_jobs job where job.tenant_id=touch.tenant_id and job.customer_id=touch.customer_id and job.status='completed') end,
       referral_customer=coalesce((select lead.source ilike '%referr%' from public.leads lead where lead.tenant_id=touch.tenant_id and lead.id=touch.lead_id),false),
       won_revenue_cents=greatest(touch.won_revenue_cents,coalesce((select sum(record.collected_cents)::int from public.revenue_attribution_records record where record.tenant_id=touch.tenant_id and (record.lead_id=touch.lead_id or record.job_id=touch.job_id or record.invoice_id=touch.invoice_id)),0))
     where touch.tenant_id=$1`,
    [tenantId]
  );
  return Number(result?.rowCount ?? 0);
}

export async function runContinuousSeoCycle(tenantId: string, brandId: string) {
  const audit = await queryPostgres<Record<string, string>>(
    `select
      (select count(*) from public.seo_page_opportunities where tenant_id=$1 and brand_id=$2 and status in ('open','planned','draft_created','in_review'))::text as page_gaps,
      (select count(*) from public.ai_search_visibility_checks where tenant_id=$1 and brand_id=$2 and status in ('manual_check','needs_connection','needs_work'))::text as ai_visibility_gaps,
      (select count(*) from public.local_presence_issues issue join public.local_presence_profiles profile on profile.id=issue.profile_id where issue.tenant_id=$1 and profile.brand_id=$2 and issue.status not in ('resolved','dismissed'))::text as local_gaps,
      (select count(*) from public.content_quality_reviews review join public.ai_drafts draft on draft.id=review.draft_id where review.tenant_id=$1 and draft.brand_id=$2 and review.quality_status in ('needs_review','blocked'))::text as quality_gaps,
      (select count(*) from public.distribution_destinations destination join public.distribution_publications publication on publication.id=destination.publication_id where destination.tenant_id=$1 and publication.brand_id=$2 and destination.status in ('needs_connection','needs_approval','needs_human','failed'))::text as distribution_gaps`,
    [tenantId, brandId]
  );
  const counts = audit?.rows[0] ?? {};
  const priorities = [
    { key: "technical_and_page", count: Number(counts.page_gaps ?? 0), action: "Review the highest-business-value technical or page opportunity." },
    { key: "ai_search", count: Number(counts.ai_visibility_gaps ?? 0), action: "Observe due representative questions and close factual/source gaps." },
    { key: "local_presence", count: Number(counts.local_gaps ?? 0), action: "Resolve accurate profile, reputation, or local-content gaps." },
    { key: "content_quality", count: Number(counts.quality_gaps ?? 0), action: "Fix usefulness, proof, structure, schema, or conversion quality before publishing." },
    { key: "distribution", count: Number(counts.distribution_gaps ?? 0), action: "Resolve connection, approval, or delivery failures without hiding them." }
  ].filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
  const cycle = await queryPostgres<{ id: string }>(
    `insert into public.seo_growth_cycles (tenant_id,brand_id,status,audit_json,priorities_json,executed_actions_json,next_run_at,completed_at)
     values ($1,$2,'measuring',$3::jsonb,$4::jsonb,$5::jsonb,now()+interval '7 days',now()) returning id`,
    [tenantId, brandId, json(counts), json(priorities), json([{ action: "refresh_existing_seo_geo_foundation", external: false }, { action: "prepare_only_until_policy_allows", external: false }])]
  );
  return { cycleId: cycle?.rows[0]?.id ?? null, priorities };
}

export async function createOwnerGrowthObjectiveFromCommand(input: { tenantId: string; brandId: string; userId?: string | null; command: string }) {
  await ensureCoreMarketingPlaybooks(input.tenantId);
  const goal = translateOwnerGrowthGoal(input.command);
  const result = await queryPostgres<{ id: string }>(
    `insert into public.growth_objectives
      (tenant_id,brand_id,name,service_focus,geography_json,time_horizon_days,autonomy_level,status,metadata_json,created_by_user_id)
     values ($1,$2,$3,$4,$5::jsonb,$6,'suggest','active',$7::jsonb,$8) returning id`,
    [input.tenantId, input.brandId, input.command.slice(0, 240), goal.serviceFocus, json(goal.geography ? { description: goal.geography } : {}), goal.timeHorizonDays,
      json({ source: "owner_plain_language_goal", goalKey: goal.goalKey, constraints: goal.constraints, composedPlaybooks: goal.playbooks }), input.userId ?? null]
  );
  const objectiveId = result?.rows[0]?.id ?? null;
  const runIds = objectiveId ? await composeMarketingPlaybookRuns({
    tenantId: input.tenantId,
    brandId: input.brandId,
    objectiveId,
    playbookKeys: goal.playbooks,
    idempotencyPrefix: `owner-goal:${objectiveId}`,
    context: { ownerCommand: input.command, translatedGoal: goal }
  }) : [];
  return { objectiveId, goal, playbookRunIds: runIds };
}

export async function runComposableGrowthIntelligence(tenantId: string) {
  const [playbooks] = await Promise.all([ensureCoreMarketingPlaybooks(tenantId), activateSeoTrafficEngine(tenantId)]);
  const brands = await queryPostgres<{ id: string }>(`select id from public.brands where tenant_id=$1 and status='active' order by created_at limit 20`, [tenantId]);
  let questions = 0;
  const brains: Array<{ brandId: string; confidence: number; missing: string[] }> = [];
  const seoCycles: Array<{ brandId: string; cycleId: string | null; priorities: unknown[] }> = [];
  for (const brand of brands?.rows ?? []) {
    const brain = await syncSharedMarketingBrain(tenantId, brand.id);
    questions += await seedRepresentativeAiSearchQuestions(tenantId, brand.id);
    const cycle = await runContinuousSeoCycle(tenantId, brand.id);
    brains.push({ brandId: brand.id, confidence: brain.confidence, missing: brain.missing });
    seoCycles.push({ brandId: brand.id, ...cycle });
  }
  const [opportunities, attributionTouches] = await Promise.all([rescoreGrowthOpportunities(tenantId), refreshGrowthValueAttribution(tenantId)]);
  return { playbooks, brands: brains.length, brains, questions, seoCycles, opportunities, attributionTouches };
}

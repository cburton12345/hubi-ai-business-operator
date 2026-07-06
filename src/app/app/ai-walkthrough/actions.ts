"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { analyzeWalkthroughTranscript, estimateLineFromObservation } from "@/lib/ai-walkthrough/walkthrough-analysis";

const sessionSchema = z.object({
  title: z.string().trim().min(2).max(160),
  walkthroughType: z.enum(["property", "roof", "inspection", "damage_claim", "rental", "jobsite", "equipment", "fleet", "other"]),
  captureMode: z.enum(["spoken_notes", "audio", "video", "photos", "mixed", "drone", "meta_glasses"]),
  siteLocation: z.string().trim().max(220).optional(),
  transcriptText: z.string().trim().min(5).max(8000),
  contentModeEnabled: z.boolean().default(false),
  mediaTitle: z.string().trim().max(160).optional(),
  mediaDescription: z.string().trim().max(500).optional(),
  mediaType: z.enum(["photo", "video", "audio", "extracted_frame", "drone_video", "meta_glasses_video", "other"]).optional()
});

const statusSchema = z.object({
  observationId: z.string().uuid(),
  reviewStatus: z.enum(["needs_review", "approved", "edited", "rejected", "converted"])
});

const estimateStatusSchema = z.object({
  estimateItemId: z.string().uuid(),
  status: z.enum(["draft", "approved", "sent_to_estimate", "rejected"])
});

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sectionFromObservations(type: string, observations: { title: string; description: string; observationType: string }[]) {
  return observations
    .filter((item) => item.observationType === type)
    .map((item) => `${item.title}: ${item.description}`)
    .join("\n");
}

export async function createAiWalkthroughAction(formData: FormData) {
  const parsed = sessionSchema.safeParse({
    title: textValue(formData, "title"),
    walkthroughType: textValue(formData, "walkthroughType") ?? "property",
    captureMode: textValue(formData, "captureMode") ?? "spoken_notes",
    siteLocation: textValue(formData, "siteLocation"),
    transcriptText: textValue(formData, "transcriptText"),
    contentModeEnabled: formData.get("contentModeEnabled") === "on",
    mediaTitle: textValue(formData, "mediaTitle"),
    mediaDescription: textValue(formData, "mediaDescription"),
    mediaType: textValue(formData, "mediaType") ?? "photo"
  });

  if (!parsed.success) {
    return;
  }

  const [tenantId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const observations = analyzeWalkthroughTranscript(parsed.data.transcriptText);
  const sessionResult = await queryPostgres<{ id: string }>(
    `
    insert into public.ai_walkthrough_sessions (
      tenant_id, title, walkthrough_type, capture_mode, status, site_location,
      transcript_text, content_mode_enabled, confidence, property_summary, damage_summary,
      customer_requests, material_requirements, labor_requirements, safety_concerns,
      follow_up_items, open_questions, created_by_user_id, metadata_json
    )
    values ($1, $2, $3, $4, 'needs_review', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb)
    returning id
    `,
    [
      tenantId,
      parsed.data.title,
      parsed.data.walkthroughType,
      parsed.data.captureMode,
      parsed.data.siteLocation ?? null,
      parsed.data.transcriptText,
      parsed.data.contentModeEnabled,
      observations.some((item) => item.confidence === "low") ? "medium" : "high",
      observations.slice(0, 5).map((item) => item.description).join("\n"),
      sectionFromObservations("damage", observations),
      sectionFromObservations("customer_request", observations),
      observations.filter((item) => item.material).map((item) => item.material).join(", "),
      sectionFromObservations("labor", observations),
      sectionFromObservations("safety", observations),
      observations.filter((item) => item.confidence === "low").map((item) => item.title).join("\n"),
      sectionFromObservations("open_question", observations),
      session?.userId ?? null,
      JSON.stringify({
        providerStatus: "review_ready",
        speechRecognition: "transcript_or_notes",
        visualAnalysis: "ready_for_connected_analysis",
        contentMode: parsed.data.contentModeEnabled ? "requested" : "off"
      })
    ]
  );
  const sessionId = sessionResult?.rows[0]?.id;
  if (!sessionId) return;

  if (parsed.data.mediaTitle || parsed.data.mediaDescription) {
    await queryPostgres(
      `
      insert into public.ai_walkthrough_media (
        tenant_id, session_id, media_type, ai_title, ai_description, location_reference, confidence, metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, 'medium', $7::jsonb)
      `,
      [
        tenantId,
        sessionId,
        parsed.data.mediaType ?? "photo",
        parsed.data.mediaTitle ?? "Walkthrough media reference",
        parsed.data.mediaDescription ?? null,
        parsed.data.siteLocation ?? null,
        JSON.stringify({ uploadStatus: "reference_only", futureUpload: true })
      ]
    );
  }

  for (const observation of observations) {
    const observationResult = await queryPostgres<{ id: string }>(
      `
      insert into public.ai_walkthrough_observations (
        tenant_id, session_id, observation_type, title, description, quantity, unit,
        material, location_reference, confidence, review_status, metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'needs_review', $11::jsonb)
      returning id
      `,
      [
        tenantId,
        sessionId,
        observation.observationType,
        observation.title,
        observation.description,
        observation.quantity,
        observation.unit,
        observation.material,
        observation.locationReference,
        observation.confidence,
        JSON.stringify({ source: "transcript_mvp" })
      ]
    );
    const observationId = observationResult?.rows[0]?.id ?? null;
    if (["damage", "measurement", "material", "customer_request", "finding"].includes(observation.observationType)) {
      await queryPostgres(
        `
        insert into public.ai_walkthrough_estimate_items (
          tenant_id, session_id, observation_id, line_item, quantity, unit, confidence, metadata_json
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        `,
        [
          tenantId,
          sessionId,
          observationId,
          estimateLineFromObservation(observation),
          observation.quantity,
          observation.unit,
          observation.confidence,
          JSON.stringify({ source: "ai_walkthrough_observation", requiresPricing: true })
        ]
      );
    }
  }

  await queryPostgres(
    `
    insert into public.ai_walkthrough_reports (tenant_id, session_id, report_type, title, status, report_json)
    values ($1, $2, 'inspection', $3, 'needs_review', $4::jsonb),
           ($1, $2, 'insurance', $5, 'draft', $6::jsonb)
    `,
    [
      tenantId,
      sessionId,
      `${parsed.data.title} inspection report`,
      JSON.stringify({ summary: "Draft generated from walkthrough transcript.", observations }),
      `${parsed.data.title} insurance support draft`,
      JSON.stringify({ damageSummary: sectionFromObservations("damage", observations), supportingMedia: [], scopeRecommendations: observations.map(estimateLineFromObservation) })
    ]
  );

  await queryPostgres(
    `
    insert into public.operator_timeline_events (tenant_id, event_family, event_type, title, body, source_table, source_id, metadata_json)
    values ($1, 'operations', 'ai_walkthrough_created', $2, $3, 'ai_walkthrough_sessions', $4, $5::jsonb)
    `,
    [
      tenantId,
      "AI Walkthrough prepared",
      `${parsed.data.title} created ${observations.length} observation(s) and draft estimate items for review.`,
      sessionId,
      JSON.stringify({ walkthroughType: parsed.data.walkthroughType, captureMode: parsed.data.captureMode })
    ]
  );

  revalidatePath("/app/ai-walkthrough");
  revalidatePath("/app/owner-command-center");
}

export async function updateWalkthroughObservationAction(formData: FormData) {
  const parsed = statusSchema.safeParse({
    observationId: textValue(formData, "observationId"),
    reviewStatus: textValue(formData, "reviewStatus")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.ai_walkthrough_observations
    set review_status = $3, updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [tenantId, parsed.data.observationId, parsed.data.reviewStatus]
  );
  revalidatePath("/app/ai-walkthrough");
}

export async function updateWalkthroughEstimateItemAction(formData: FormData) {
  const parsed = estimateStatusSchema.safeParse({
    estimateItemId: textValue(formData, "estimateItemId"),
    status: textValue(formData, "status")
  });
  if (!parsed.success) return;
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.ai_walkthrough_estimate_items
    set status = $3, updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [tenantId, parsed.data.estimateItemId, parsed.data.status]
  );
  revalidatePath("/app/ai-walkthrough");
}

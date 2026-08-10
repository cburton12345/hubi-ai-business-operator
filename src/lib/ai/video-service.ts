import { generateJsonWithAiService } from "@/lib/ai/ai-service";

export type VideoPlatform = "facebook" | "instagram" | "tiktok" | "youtube" | "reddit" | "google_display" | "ctv" | "multi_platform";

export type VideoPlanInput = {
  goal: string;
  serviceLabel?: string | null;
  offerLabel?: string | null;
  platform: VideoPlatform;
  durationSeconds: number;
  audience?: string | null;
  sourceAssets?: string | null;
  variantCount?: number;
};

export type CreativeIssue = {
  code: string;
  severity: "note" | "warning" | "blocker";
  message: string;
  repair: string;
};

export type CreativePreflight = {
  score: number;
  decision: "ready" | "improve_first" | "blocked";
  strengths: string[];
  issues: CreativeIssue[];
  checks: Array<{ label: string; passed: boolean; detail: string }>;
};

export type VideoDeliverable = {
  key: string;
  label: string;
  aspectRatio: "16:9" | "9:16" | "1:1" | "4:5";
  use: string;
  productionMethod: "source_render" | "local_reframe";
};

export type VideoPlan = {
  providerKey: string;
  status: "needs_review";
  script: string;
  scenes: Array<{
    scene: number;
    seconds: string;
    goal: string;
    visual: string;
    textOverlay: string;
  }>;
  voiceover: string;
  cta: string;
  variantPrompts: Array<{
    variant: number;
    hookAngle: string;
    instruction: string;
  }>;
  providerRequest: Record<string, unknown>;
  history: Array<{ status: string; at: string; note: string }>;
  metadata: Record<string, unknown>;
};

type AiCreativeDirection = {
  hook?: unknown;
  script?: unknown;
  voiceover?: unknown;
  cta?: unknown;
  rationale?: unknown;
  scenes?: unknown;
  risks?: unknown;
};

function cleanText(value: unknown, fallback: string, max = 800) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function stringList(value: unknown, maxItems = 6) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, maxItems)
    : [];
}

function aspectRatiosFor(platform: VideoPlatform): VideoDeliverable["aspectRatio"][] {
  if (platform === "youtube" || platform === "ctv") return ["16:9", "9:16"];
  if (platform === "multi_platform") return ["16:9", "9:16", "1:1"];
  return ["9:16", "1:1", "4:5"];
}

export function videoDeliverablesFor(platform: VideoPlatform): VideoDeliverable[] {
  return aspectRatiosFor(platform).map((aspectRatio, index) => ({
    key: `${platform}-${aspectRatio.replace(":", "x")}`,
    label: index === 0 ? "Primary ad" : `${aspectRatio} channel cut`,
    aspectRatio,
    use: aspectRatio === "16:9" ? "YouTube, connected TV, and website" : aspectRatio === "9:16" ? "Reels, Shorts, TikTok, and Stories" : "Feeds and placements",
    productionMethod: index === 0 ? "source_render" : "local_reframe"
  }));
}

function suspiciousClaims(input: VideoPlanInput) {
  const claimText = `${input.goal} ${input.offerLabel ?? ""}`.toLowerCase();
  return ["guaranteed", "best in", "#1", "number one", "zero risk", "always", "never fails"]
    .filter((claim) => claimText.includes(claim));
}

export function scoreVideoCreative(input: VideoPlanInput): CreativePreflight {
  const strengths: string[] = [];
  const issues: CreativeIssue[] = [];
  const checks: CreativePreflight["checks"] = [];
  let score = 35;

  const addCheck = (label: string, passed: boolean, points: number, detail: string, issue?: CreativeIssue) => {
    checks.push({ label, passed, detail });
    if (passed) {
      score += points;
      strengths.push(detail);
    } else if (issue) {
      issues.push(issue);
    }
  };

  addCheck("Clear objective", input.goal.trim().length >= 12, 15, "The objective is specific enough to direct the first cut.", {
    code: "goal_too_vague", severity: "blocker", message: "The objective is too vague to justify a paid render.", repair: "State the customer problem and the action the ad should produce."
  });
  addCheck("Defined audience", Boolean(input.audience?.trim()), 10, "The intended viewer is defined.", {
    code: "audience_missing", severity: "warning", message: "The audience is not defined, so the hook may feel generic.", repair: "Name the customer, industry, or situation this ad should speak to."
  });
  addCheck("Specific service", Boolean(input.serviceLabel?.trim()), 10, "The promoted service or product is explicit.", {
    code: "service_missing", severity: "warning", message: "No specific service or product is attached.", repair: "Choose the offer customers should understand immediately."
  });
  addCheck("Offer or next step", Boolean(input.offerLabel?.trim()), 10, "The ad has a concrete offer or next step.", {
    code: "offer_missing", severity: "warning", message: "The next step may be too generic.", repair: "Add the offer, consultation, quote, trial, or other clear next action."
  });
  addCheck("Real proof available", Boolean(input.sourceAssets?.trim()), 15, "Real approved business proof can ground the generated footage.", {
    code: "proof_missing", severity: "warning", message: "No real photos, footage, reviews, or product screens were supplied.", repair: "Add approved proof when possible; Ferocity can still make a concept-first cut without it."
  });
  addCheck("Efficient duration", input.durationSeconds <= 30, 5, "The duration is appropriate for a focused first cut.", {
    code: "duration_long", severity: "note", message: "A long first concept can waste generation budget.", repair: "Prove the hook in a short cut before expanding it."
  });

  const claims = suspiciousClaims(input);
  if (claims.length) {
    score -= 20;
    issues.push({
      code: "claim_review_required",
      severity: "blocker",
      message: `Potentially unsupported claim language needs evidence: ${claims.join(", ")}.`,
      repair: "Replace the absolute claim or attach evidence and obtain approval before rendering."
    });
    checks.push({ label: "Claims are supportable", passed: false, detail: "Absolute marketing claims require evidence." });
  } else {
    score += 5;
    checks.push({ label: "Claims are supportable", passed: true, detail: "No obvious absolute claim language was detected." });
  }

  score = Math.max(0, Math.min(100, score));
  const hasBlocker = issues.some((issue) => issue.severity === "blocker");
  return {
    score,
    decision: hasBlocker ? "blocked" : score >= 70 ? "ready" : "improve_first",
    strengths: strengths.slice(0, 5),
    issues,
    checks
  };
}

function defaultScenes(input: VideoPlanInput) {
  const ending = Math.max(12, input.durationSeconds);
  return [
    { scene: 1, seconds: "0-3", goal: "Earn attention with the customer problem or desired outcome.", visual: "Use a specific, believable moment rather than generic stock footage.", textOverlay: input.goal },
    { scene: 2, seconds: "3-8", goal: "Show what changes and why the business is credible.", visual: input.sourceAssets || "Use an authentic service moment, product screen, or result that can be verified.", textOverlay: input.serviceLabel || "A better way forward" },
    { scene: 3, seconds: "8-12", goal: "Make the result and next action unmistakable.", visual: "Use approved proof, a real workflow, or a clear product demonstration.", textOverlay: input.offerLabel || "See what happens next" },
    { scene: 4, seconds: `12-${ending}`, goal: "Finish with the brand, destination, and one call to action.", visual: "Add exact brand assets, URL or phone, captions, and a clean end card during finishing.", textOverlay: input.offerLabel || "Get started" }
  ];
}

function normalizeAiScenes(value: unknown, fallback: ReturnType<typeof defaultScenes>) {
  if (!Array.isArray(value)) return fallback;
  const scenes = value.slice(0, 6).map((item, index) => {
    const row = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    const base = fallback[Math.min(index, fallback.length - 1)];
    return {
      scene: index + 1,
      seconds: cleanText(row.seconds, base.seconds, 30),
      goal: cleanText(row.goal, base.goal, 300),
      visual: cleanText(row.visual, base.visual, 500),
      textOverlay: cleanText(row.textOverlay, base.textOverlay, 120)
    };
  });
  return scenes.length >= 3 ? scenes : fallback;
}

function buildBasePlan(input: VideoPlanInput, direction?: AiCreativeDirection): VideoPlan {
  const fallbackScenes = defaultScenes(input);
  const preflight = scoreVideoCreative(input);
  const cta = cleanText(direction?.cta, input.offerLabel || "Request a quote", 120);
  const scriptFallback = [
    `Hook: ${input.goal}.`,
    input.serviceLabel ? `Show how ${input.serviceLabel} changes the situation.` : "Show the change, not a feature list.",
    input.audience ? `Speak directly to ${input.audience}.` : null,
    "Use truthful, specific proof and make the next step obvious.",
    `Close: ${cta}.`
  ].filter(Boolean).join("\n");
  const script = cleanText(direction?.script, scriptFallback, 1800);
  const scenes = normalizeAiScenes(direction?.scenes, fallbackScenes);
  const voiceover = cleanText(direction?.voiceover, `${input.goal}. ${input.serviceLabel ? `${input.serviceLabel} helps move the work forward. ` : ""}${cta}.`, 1200);
  const variantPrompts = Array.from({ length: input.variantCount ?? 3 }, (_, index) => ({
    variant: index + 1,
    hookAngle: ["customer pain", "proof and result", "future state", "owner trust", "local relevance"][index] ?? "direct response",
    instruction: "Change the opening idea and first three seconds while preserving truthful claims, the offer, the brand, and the approved destination."
  }));
  const deliverables = videoDeliverablesFor(input.platform);
  const creativeDirection = {
    hook: cleanText(direction?.hook, input.goal, 240),
    rationale: cleanText(direction?.rationale, "Lead with the business outcome, demonstrate it with credible proof, and finish with one clear action.", 800),
    risks: stringList(direction?.risks),
    generatedBy: direction ? "ai_creative_director" : "deterministic_fallback"
  };

  return {
    providerKey: "provider_not_selected",
    status: "needs_review",
    script,
    scenes,
    voiceover,
    cta,
    variantPrompts,
    providerRequest: {
      providerReady: false,
      platform: input.platform,
      durationSeconds: input.durationSeconds,
      aspectRatios: deliverables.map((item) => item.aspectRatio),
      exportFormats: ["finished_video", "captioned_video", "clean_master", "captions", "provider_brief"],
      sourceAssets: input.sourceAssets ? [input.sourceAssets] : [],
      supportedProviders: ["openai_video", "google_veo", "future_adapter"],
      creativeDirection,
      preflight
    },
    history: [{ status: "creative_direction_ready", at: new Date().toISOString(), note: "Ferocity prepared and scored the concept before any premium provider spend." }],
    metadata: {
      approvalRequired: true,
      noProviderSubmitted: true,
      creditRequiredForRendering: true,
      platform: input.platform,
      durationSeconds: input.durationSeconds,
      audience: input.audience ?? null,
      variantPrompts,
      creativeDirection,
      creativePreflight: preflight,
      deliverables,
      productionStatus: preflight.decision === "blocked" ? "creative_revision_required" : "ready_for_render_review",
      qualityReview: { status: "not_started", score: null, inspectedFrames: 0 },
      finishing: {
        status: "waiting_for_render",
        included: ["quality inspection", "approved message captions", "brand and CTA overlay", "audio review", "channel reframes", "publish-readiness check"],
        paidRerenderPolicy: "Only when the underlying footage cannot be repaired and saved authority permits another charge."
      }
    }
  };
}

export function planVideoMarketingAsset(input: VideoPlanInput): VideoPlan {
  return buildBasePlan(input);
}

export async function directVideoMarketingAsset(input: VideoPlanInput & { tenantId: string; brandId?: string | null; userId?: string | null }): Promise<VideoPlan> {
  const fallback = buildBasePlan(input);
  const direction = await generateJsonWithAiService<AiCreativeDirection & Record<string, unknown>>({
    tenantId: input.tenantId,
    brandId: input.brandId,
    userId: input.userId,
    runType: "video_creative_direction",
    featureKey: "ai_generation",
    system: [
      "You are Ferocity's advertising creative director.",
      "Create a concrete, truthful, high-retention short-video concept that demonstrates an outcome instead of listing features.",
      "Return hook, script, voiceover, cta, rationale, risks, and 3-6 scenes.",
      "Each scene must contain seconds, goal, visual, and textOverlay.",
      "Never invent reviews, credentials, prices, guarantees, logos, customer results, or product behavior."
    ].join(" "),
    user: JSON.stringify({
      goal: input.goal,
      service: input.serviceLabel ?? null,
      offer: input.offerLabel ?? null,
      audience: input.audience ?? null,
      platform: input.platform,
      durationSeconds: input.durationSeconds,
      approvedSourceAssets: input.sourceAssets ?? null
    }),
    fallback: fallback.providerRequest.creativeDirection as AiCreativeDirection & Record<string, unknown>,
    temperature: 0.55,
    timeoutMs: 18_000,
    metadata: { purpose: "pre_spend_video_direction", platform: input.platform }
  });
  return buildBasePlan(input, direction);
}

export type FrameReview = {
  inspected?: boolean;
  score: number;
  observations: string[];
  issues: Array<{ category: string; severity: "note" | "warning" | "blocker"; message: string; repairableWithoutRerender: boolean; repair: string }>;
};

export function aggregateVideoFrameReviews(reviews: FrameReview[]) {
  const valid = reviews.filter((review) => review.inspected !== false && Number.isFinite(review.score));
  if (!valid.length) {
    return {
      status: "unavailable",
      score: 0,
      decision: "manual_review_required" as const,
      inspectedFrames: 0,
      observations: [],
      issues: [],
      localRepairs: [],
      rerenderReasons: [],
      paidRerenderRequired: false,
      note: "Automated visual inspection was unavailable. Ferocity did not pretend the source passed; a review is still required before finishing or publishing."
    };
  }
  const score = valid.length ? Math.round(valid.reduce((total, review) => total + review.score, 0) / valid.length) : 0;
  const issues = valid.flatMap((review) => review.issues).slice(0, 18);
  const blocker = issues.some((issue) => issue.severity === "blocker" && !issue.repairableWithoutRerender);
  const localRepairs = Array.from(new Set(issues.filter((issue) => issue.repairableWithoutRerender).map((issue) => issue.repair)));
  const rerenderReasons = Array.from(new Set(issues.filter((issue) => !issue.repairableWithoutRerender).map((issue) => issue.message)));

  return {
    status: "complete",
    score,
    decision: blocker || score < 55 ? "rerender_recommended" : issues.some((issue) => issue.severity !== "note") ? "finish_with_repairs" : "ready_to_finish",
    inspectedFrames: valid.length,
    observations: Array.from(new Set(valid.flatMap((review) => review.observations))).slice(0, 12),
    issues,
    localRepairs,
    rerenderReasons,
    paidRerenderRequired: false,
    note: rerenderReasons.length
      ? "Ferocity found footage concerns. No new paid generation was started; the owner can repair, approve a rerender, or choose another source clip."
      : "Ferocity will finish this cut without another premium video generation."
  };
}

export function videoFinishingPlan(input: { brandName?: string | null; domain?: string | null; cta?: string | null; platform?: VideoPlatform | null; qualityReview: ReturnType<typeof aggregateVideoFrameReviews> }) {
  const deliverables = videoDeliverablesFor(input.platform ?? "multi_platform");
  return {
    status: input.qualityReview.decision === "rerender_recommended" ? "awaiting_footage_decision" : "ready_for_local_finish",
    noAdditionalPremiumRender: input.qualityReview.decision !== "rerender_recommended",
    brandOverlay: input.brandName || "Current brand",
    destinationOverlay: input.domain || "Use the approved campaign destination",
    ctaOverlay: input.cta || "Learn more",
    automaticSteps: [
      "Add exact on-screen messaging from the approved voiceover draft",
      "Apply brand, destination, and CTA in post so the generator cannot misspell them",
      "Preserve safe margins and flag source audio that still needs attention",
      "Create the approved channel aspect ratios from the same source render",
      ...input.qualityReview.localRepairs
    ],
    deliverables,
    publishGate: "Keep every deliverable out of publishing until the quality review passes and the saved approval policy allows release."
  };
}

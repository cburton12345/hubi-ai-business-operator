import { generateVisionJsonWithAiService } from "@/lib/ai/ai-service";
import { aggregateVideoFrameReviews, type FrameReview } from "@/lib/ai/video-service";

type FrameInput = { atPercent: number; imageDataUrl: string };

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function boundedScore(value: unknown) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
}

function reviewFromUnknown(value: unknown): FrameReview {
  const row = record(value);
  const issues = Array.isArray(row.issues) ? row.issues.slice(0, 8).map((item) => {
    const issue = record(item);
    const severity: "note" | "warning" | "blocker" = issue.severity === "blocker" || issue.severity === "warning" ? issue.severity : "note";
    return {
      category: typeof issue.category === "string" ? issue.category.slice(0, 80) : "visual_quality",
      severity,
      message: typeof issue.message === "string" ? issue.message.slice(0, 400) : "Review this frame before publishing.",
      repairableWithoutRerender: issue.repairableWithoutRerender !== false,
      repair: typeof issue.repair === "string" ? issue.repair.slice(0, 400) : "Correct during post-production."
    };
  }) : [];
  return {
    inspected: row.inspected === true,
    score: boundedScore(row.score),
    observations: Array.isArray(row.observations)
      ? row.observations.filter((item): item is string => typeof item === "string").slice(0, 6)
      : [],
    issues
  };
}

export async function reviewRenderedVideoFrames(input: {
  tenantId: string;
  brandId?: string | null;
  userId?: string | null;
  goal?: string | null;
  script?: string | null;
  cta?: string | null;
  frames: FrameInput[];
}) {
  const frames = input.frames.slice(0, 3);
  const reviews = await Promise.all(frames.map(async (frame, index) => {
    const fallback: FrameReview & Record<string, unknown> = {
      inspected: false,
      score: 0,
      observations: [],
      issues: []
    };
    const response = await generateVisionJsonWithAiService<FrameReview & Record<string, unknown>>({
      tenantId: input.tenantId,
      brandId: input.brandId,
      userId: input.userId,
      featureKey: "ai_generation",
      runType: "video_frame_quality_review",
      aiCategory: "core",
      imageUrl: frame.imageDataUrl,
      mimeType: "image/jpeg",
      system: [
        "You are Ferocity's video quality inspector.",
        "Inspect only what is visible in this frame; never infer a passing result from the requested prompt.",
        "Look for malformed people or objects, unreadable or invented text, visual artifacts, brand or claim risk, poor composition, weak subject clarity, and unsafe cropping.",
        "Separate defects repairable in post-production from footage defects requiring a new source.",
        "Return JSON with inspected=true, score 0-100, observations, and issues.",
        "Every issue must contain category, severity (note, warning, or blocker), message, repairableWithoutRerender, and repair."
      ].join(" "),
      userText: JSON.stringify({
        frame: index + 1,
        atPercent: frame.atPercent,
        objective: input.goal ?? null,
        approvedScript: input.script ?? null,
        approvedCta: input.cta ?? null
      }),
      fallback,
      temperature: 0.1,
      timeoutMs: 20_000,
      metadata: { purpose: "post_render_video_qc", frame: index + 1, atPercent: frame.atPercent }
    });
    return reviewFromUnknown(response);
  }));

  return aggregateVideoFrameReviews(reviews);
}

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

function aspectRatiosFor(platform: VideoPlatform) {
  if (platform === "youtube" || platform === "ctv") return ["16:9", "9:16"];
  return ["9:16", "1:1", "4:5"];
}

function estimateRenderingValue(input: VideoPlanInput) {
  const hasProof = Boolean(input.sourceAssets?.trim());
  const likelyVideoPlatform = ["tiktok", "youtube", "instagram", "facebook", "multi_platform"].includes(input.platform);
  const score = 45 + (hasProof ? 25 : 0) + (likelyVideoPlatform ? 20 : 0) + (input.durationSeconds <= 30 ? 10 : 0);

  return {
    score: Math.min(score, 100),
    recommendation: hasProof
      ? "Use existing proof first. Render only after the script, claim checks, and customer permissions are approved."
      : "Start with a script and storyboard. Ask for real photos, clips, reviews, or proof before spending on a premium render."
  };
}

export function planVideoMarketingAsset(input: VideoPlanInput): VideoPlan {
  const script = [
    `Hook: ${input.goal}.`,
    input.serviceLabel ? `Service: ${input.serviceLabel}.` : null,
    input.offerLabel ? `Offer: ${input.offerLabel}.` : null,
    input.audience ? `Audience: ${input.audience}.` : null,
    "Show the problem, show proof, make the next step obvious.",
    "Review claims, licenses, pricing, testimonials, permissions, and service area before publishing."
  ].filter(Boolean).join("\n");
  const scenes = [
    { scene: 1, seconds: "0-3", goal: "Stop the scroll with the customer problem or desired outcome.", visual: "Use job photo, owner talking head, or strong text overlay.", textOverlay: input.goal },
    { scene: 2, seconds: "3-8", goal: "Show the service, proof, or transformation.", visual: input.sourceAssets || "Use approved before/after photos, review screenshots, job footage, or product clips.", textOverlay: input.serviceLabel || "Trusted help" },
    { scene: 3, seconds: "8-12", goal: "Add trust: review, result, warranty, speed, guarantee, or process.", visual: "Use customer proof only when permission exists.", textOverlay: "Real results. Clear next step." },
    { scene: 4, seconds: `12-${input.durationSeconds}`, goal: "Close with the offer and call to action.", visual: "Logo, phone/URL, service area, and CTA.", textOverlay: input.offerLabel || "Get started today" }
  ];
  const variantPrompts = Array.from({ length: input.variantCount ?? 3 }, (_, index) => ({
    variant: index + 1,
    hookAngle: ["pain point", "proof/result", "offer/urgency", "owner trust", "local relevance"][index] ?? "direct response",
    instruction: "Create a different hook and first 3 seconds while keeping the same offer, proof rules, and approval rules."
  }));
  const renderDecision = estimateRenderingValue(input);
  const providerRequest = {
    providerReady: false,
    platform: input.platform,
    durationSeconds: input.durationSeconds,
    aspectRatios: aspectRatiosFor(input.platform),
    exportFormats: ["script", "scene_plan", "voiceover", "caption", "provider_brief"],
    sourceAssets: input.sourceAssets ?? null,
    renderDecision,
    supportedProviders: ["manual_editor", "quickframe_style_brief", "runway", "kling", "veo", "openai_media"]
  };

  return {
    providerKey: "provider_not_selected",
    status: "needs_review",
    script,
    scenes,
    voiceover: `Voiceover draft: ${input.goal}. ${input.offerLabel ? `${input.offerLabel}. ` : ""}Tap, call, or request a quote to get started.`,
    cta: input.offerLabel || "Request a quote",
    variantPrompts,
    providerRequest,
    history: [{ status: "draft", at: new Date().toISOString(), note: "Video brief prepared. No premium provider render was submitted." }],
    metadata: {
      approvalRequired: true,
      noProviderSubmitted: true,
      creditRequiredForRendering: true,
      addOnRecommended: renderDecision.score >= 70,
      platform: input.platform,
      durationSeconds: input.durationSeconds,
      audience: input.audience ?? null,
      variantPrompts,
      renderDecision
    }
  };
}

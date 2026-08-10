export const GOLDEN_LOOP_STAGE_KEYS = [
  "demand_source_recorded",
  "lead_captured",
  "lead_qualified",
  "estimate_prepared",
  "estimate_accepted",
  "work_scheduled",
  "work_completed",
  "invoice_issued",
  "payment_received",
  "margin_recorded",
  "review_requested",
  "proof_repurposed",
  "growth_restarted"
] as const;

export type GoldenLoopStageKey = (typeof GOLDEN_LOOP_STAGE_KEYS)[number];
export type GoldenLoopStageStatus =
  | "waiting_evidence"
  | "ready"
  | "completed"
  | "blocked"
  | "failed"
  | "dead_lettered";

export type GoldenLoopEvidence = {
  complete: boolean;
  sourceType?: string | null;
  sourceId?: string | null;
  occurredAt?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown>;
};

export type GoldenLoopSnapshot = Record<GoldenLoopStageKey, GoldenLoopEvidence>;

export type GoldenLoopStageEvaluation = {
  key: GoldenLoopStageKey;
  ordinal: number;
  label: string;
  status: GoldenLoopStageStatus;
  evidence: GoldenLoopEvidence;
  blockedBy: GoldenLoopStageKey | null;
  handoffGap: boolean;
};

export type GoldenLoopEvaluation = {
  status: "active" | "completed";
  currentStage: GoldenLoopStageKey;
  completedStages: number;
  handoffGaps: GoldenLoopStageKey[];
  stages: GoldenLoopStageEvaluation[];
};

export const GOLDEN_LOOP_STAGE_DEFINITIONS: ReadonlyArray<{
  key: GoldenLoopStageKey;
  label: string;
}> = [
  { key: "demand_source_recorded", label: "Demand source recorded" },
  { key: "lead_captured", label: "Lead captured" },
  { key: "lead_qualified", label: "Lead qualified" },
  { key: "estimate_prepared", label: "Estimate prepared" },
  { key: "estimate_accepted", label: "Estimate accepted" },
  { key: "work_scheduled", label: "Work scheduled" },
  { key: "work_completed", label: "Work completed" },
  { key: "invoice_issued", label: "Invoice issued" },
  { key: "payment_received", label: "Payment received" },
  { key: "margin_recorded", label: "Job margin recorded" },
  { key: "review_requested", label: "Review requested" },
  { key: "proof_repurposed", label: "Proof repurposed" },
  { key: "growth_restarted", label: "Growth loop restarted" }
];

export function emptyGoldenLoopSnapshot(): GoldenLoopSnapshot {
  return Object.fromEntries(
    GOLDEN_LOOP_STAGE_KEYS.map((key) => [key, { complete: false }])
  ) as GoldenLoopSnapshot;
}

/**
 * Evaluates facts without pretending a handoff worked. Later evidence remains visible,
 * but a stage is only considered completed when every earlier stage is also proven.
 */
export function evaluateGoldenLoop(snapshot: GoldenLoopSnapshot): GoldenLoopEvaluation {
  let firstIncomplete: GoldenLoopStageKey | null = null;
  const handoffGaps: GoldenLoopStageKey[] = [];

  const stages = GOLDEN_LOOP_STAGE_DEFINITIONS.map((definition, index) => {
    const evidence = snapshot[definition.key];
    const priorIncomplete = firstIncomplete;
    if (!evidence.complete && !firstIncomplete) firstIncomplete = definition.key;
    const handoffGap = evidence.complete && priorIncomplete !== null;
    if (handoffGap) handoffGaps.push(definition.key);

    let status: GoldenLoopStageStatus;
    if (evidence.complete && !priorIncomplete) status = "completed";
    else if (handoffGap) status = "blocked";
    else if (!priorIncomplete && firstIncomplete === definition.key) status = "ready";
    else status = "waiting_evidence";

    return {
      key: definition.key,
      ordinal: index + 1,
      label: definition.label,
      status,
      evidence,
      blockedBy: handoffGap ? priorIncomplete : null,
      handoffGap
    } satisfies GoldenLoopStageEvaluation;
  });

  const complete = firstIncomplete === null;
  return {
    status: complete ? "completed" : "active",
    currentStage: firstIncomplete ?? "growth_restarted",
    completedStages: stages.filter((stage) => stage.status === "completed").length,
    handoffGaps,
    stages
  };
}

export function retryDelaySeconds(attempt: number) {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(60 * 60, 30 * 2 ** (safeAttempt - 1));
}

export function failureDisposition(attempt: number, maxAttempts = 5) {
  if (attempt >= maxAttempts) return { status: "dead_lettered" as const, retryAfterSeconds: null };
  return { status: "failed" as const, retryAfterSeconds: retryDelaySeconds(attempt) };
}

import type { ImageGenerationProvider } from "@/lib/providers/interfaces";

export type ManagedImageJob = {
  id: string;
  tenantId: string;
  brandId: string | null;
  status: string;
  prompt: string;
  size: string;
  sourceAssets: string[];
  outputAssetId?: string | null;
  approvalHash?: string | null;
  approvalVersion?: string | null;
  approvedByActorKey?: string | null;
  approvedAt?: string | null;
  approvalInputJson?: Record<string, unknown>;
};

export type ManagedImageOutcome =
  | { status: "generated"; assetId: string; idempotent: boolean }
  | { status: "cancelled" }
  | { status: "blocked" | "failed" | "unknown"; reason: string };

export type ManagedImageDependencies = {
  configuration: { providerKey: string; model: string } | null;
  provider: ImageGenerationProvider | null;
  loadJob(tenantId: string, jobId: string): Promise<ManagedImageJob | null>;
  claimJob(job: ManagedImageJob): Promise<boolean>;
  reserveBudget(job: ManagedImageJob): Promise<{ id: string; idempotencyKey: string } | null>;
  isCancelled(tenantId: string, jobId: string): Promise<boolean>;
  approvalMatches(job: ManagedImageJob): Promise<boolean>;
  storeOutput(input: { job: ManagedImageJob; bytes: ArrayBuffer; reservationId: string; providerRequestId?: string; usage: Record<string, unknown> }): Promise<{ assetId: string }>;
  markFailure(input: { job: ManagedImageJob; reservationId?: string; status: "failed" | "unknown"; reason: string; voidReservation: boolean }): Promise<void>;
};

function validate(job: ManagedImageJob) {
  if (job.prompt.trim().length < 12 || job.prompt.trim().length > 6000) return "The image prompt must be between 12 and 6,000 characters.";
  if (!["1024x1024", "1536x1024", "1024x1536"].includes(job.size)) return "The requested image size is not supported.";
  if (job.sourceAssets.length > 0) return "Source assets require the image-edit adapter and were not submitted.";
  return null;
}

export async function runApprovedImageGeneration(input: { tenantId: string; jobId: string }, deps: ManagedImageDependencies): Promise<ManagedImageOutcome> {
  const job = await deps.loadJob(input.tenantId, input.jobId);
  if (!job || job.tenantId !== input.tenantId) return { status: "blocked", reason: "Image job not found in this workspace." };
  if (job.status === "generated" && job.outputAssetId) return { status: "generated", assetId: job.outputAssetId, idempotent: true };
  if (job.status === "cancelled") return { status: "cancelled" };
  if (!["approved", "failed"].includes(job.status)) return { status: "blocked", reason: job.status === "unknown" ? "The prior provider outcome is unknown and requires review before another paid request." : "Image generation requires explicit approval." };
  if (!job.approvalHash || !job.approvalVersion || !job.approvedByActorKey || !job.approvedAt || !await deps.approvalMatches(job)) return { status: "blocked", reason: "The approved input or quote changed and requires a new approval." };
  const invalid = validate(job);
  if (invalid) return { status: "blocked", reason: invalid };
  if (!deps.configuration || !deps.provider) return { status: "blocked", reason: "Managed image generation is not configured." };
  if (!await deps.claimJob(job)) return { status: "blocked", reason: "This image job is already processing or its approval changed." };
  const reservation = await deps.reserveBudget(job);
  if (!reservation) {
    const reason = "The image budget cap would be exceeded or this request was already reserved.";
    await deps.markFailure({ job, status: "failed", reason, voidReservation: true });
    return { status: "blocked", reason };
  }
  if (await deps.isCancelled(input.tenantId, input.jobId)) {
    await deps.markFailure({ job, reservationId: reservation.id, status: "failed", reason: "The image job was cancelled before provider submission.", voidReservation: true });
    return { status: "cancelled" };
  }
  const result = await deps.provider.createImage({ tenantId: input.tenantId, brandId: job.brandId, correlationId: `managed-image:${job.id}`, idempotencyKey: reservation.idempotencyKey, liveActionsEnabled: true }, { prompt: job.prompt, assets: job.sourceAssets, size: job.size, model: deps.configuration.model });
  if (!result.ok) {
    const status = result.retryable ? "unknown" : "failed";
    await deps.markFailure({ job, reservationId: reservation.id, status, reason: result.safeMessage, voidReservation: !result.retryable });
    return { status, reason: result.safeMessage };
  }
  if (await deps.isCancelled(input.tenantId, input.jobId)) {
    await deps.markFailure({ job, reservationId: reservation.id, status: "failed", reason: "The image job was cancelled before its output was stored.", voidReservation: false });
    return { status: "cancelled" };
  }
  if (!result.data.imageBuffer) {
    const reason = "The provider returned no persistable image output.";
    await deps.markFailure({ job, reservationId: reservation.id, status: "failed", reason, voidReservation: false });
    return { status: "failed", reason };
  }
  try {
    const stored = await deps.storeOutput({ job, bytes: result.data.imageBuffer, reservationId: reservation.id, providerRequestId: result.providerRequestId, usage: result.data.usage as unknown as Record<string, unknown> });
    return { status: "generated", assetId: stored.assetId, idempotent: false };
  } catch {
    const reason = "The provider completed, but durable storage was not confirmed. Review the unknown outcome before retrying.";
    await deps.markFailure({ job, reservationId: reservation.id, status: "unknown", reason, voidReservation: false });
    return { status: "unknown", reason };
  }
}

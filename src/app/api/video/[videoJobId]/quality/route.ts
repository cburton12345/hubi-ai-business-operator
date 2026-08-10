import { NextResponse } from "next/server";
import { getCurrentAppSession } from "@/lib/auth/session";
import { reviewRenderedVideoFrames } from "@/lib/ai/video-quality-review";
import { videoFinishingPlan, type VideoPlatform } from "@/lib/ai/video-service";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export const dynamic = "force-dynamic";

type QualityJob = {
  id: string;
  brand_id: string | null;
  status: string;
  goal: string | null;
  script_text: string | null;
  cta_text: string | null;
  metadata_json: Record<string, unknown> | null;
  brand_name: string | null;
  brand_domain: string | null;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function validFrame(value: unknown): value is { atPercent: number; imageDataUrl: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Record<string, unknown>;
  return typeof frame.atPercent === "number"
    && frame.atPercent >= 0
    && frame.atPercent <= 1
    && typeof frame.imageDataUrl === "string"
    && /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(frame.imageDataUrl)
    && frame.imageDataUrl.length <= 900_000;
}

export async function POST(request: Request, { params }: { params: Promise<{ videoJobId: string }> }) {
  const session = await getCurrentAppSession();
  if (!session?.userId) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

  const [{ videoJobId }, tenantId, body] = await Promise.all([
    params,
    getCurrentWorkspaceId(),
    request.json().catch(() => null)
  ]);
  const frames = record(body).frames;
  if (!Array.isArray(frames) || frames.length < 2 || frames.length > 3 || !frames.every(validFrame)) {
    return NextResponse.json({ ok: false, error: "Two or three valid inspection frames are required." }, { status: 400 });
  }

  const result = await queryPostgres<QualityJob>(
    `
    select v.id, v.brand_id, v.status, v.goal, v.script_text, v.cta_text, v.metadata_json,
           b.name as brand_name, b.domain as brand_domain
    from public.marketing_video_jobs v
    left join public.brands b on b.id = v.brand_id and b.tenant_id = v.tenant_id
    where v.tenant_id = $1 and v.id = $2
    limit 1
    `,
    [tenantId, videoJobId]
  );
  const job = result?.rows[0];
  if (!job || job.status !== "completed") {
    return NextResponse.json({ ok: false, error: "Source footage must finish rendering before inspection." }, { status: 409 });
  }
  const metadata = record(job.metadata_json);
  const existing = record(metadata.qualityReview);
  if (existing.status === "complete" && Number(existing.inspectedFrames) >= 2) {
    return NextResponse.json({ ok: true, qualityReview: existing, finishing: metadata.finishing, cached: true });
  }

  await queryPostgres(
    `
    update public.marketing_video_jobs
    set metadata_json = metadata_json || $3::jsonb, updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [tenantId, videoJobId, JSON.stringify({ qualityReview: { status: "inspecting", inspectedFrames: 0, startedAt: new Date().toISOString() } })]
  );

  const qualityReview = await reviewRenderedVideoFrames({
    tenantId,
    brandId: job.brand_id,
    userId: session.userId,
    goal: job.goal,
    script: job.script_text,
    cta: job.cta_text,
    frames
  });
  const platform = typeof metadata.platform === "string" ? metadata.platform as VideoPlatform : "multi_platform";
  const finishing = videoFinishingPlan({
    brandName: job.brand_name,
    domain: job.brand_domain,
    cta: job.cta_text,
    platform,
    qualityReview
  });
  const productionStatus = qualityReview.decision === "rerender_recommended"
    ? "footage_decision_required"
    : qualityReview.decision === "manual_review_required"
      ? "manual_quality_review_required"
      : "ready_for_local_finish";

  await queryPostgres(
    `
    update public.marketing_video_jobs
    set metadata_json = metadata_json || $3::jsonb,
        history_json = history_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      tenantId,
      videoJobId,
      JSON.stringify({ qualityReview, finishing, productionStatus }),
      JSON.stringify([{
        status: productionStatus,
        at: new Date().toISOString(),
        note: qualityReview.note
      }])
    ]
  );

  return NextResponse.json({ ok: true, qualityReview, finishing });
}

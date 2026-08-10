import { queryPostgres } from "@/lib/db/postgres";

type ProofRow = {
  id: string;
  brand_id: string | null;
  title: string | null;
  customer_name: string | null;
  service_type: string | null;
  city: string | null;
  state: string | null;
  story_text: string | null;
  result_summary: string | null;
  rating: number | null;
  permission_marketing: boolean;
  permission_use_name: boolean;
  permission_use_location: boolean;
};

const proofOutputs = [
  { outputType: "gbp_post", contentType: "gbp_post", titlePrefix: "GBP proof post" },
  { outputType: "facebook_post", contentType: "facebook_post", titlePrefix: "Facebook proof post" },
  { outputType: "seo_page", contentType: "city_page", titlePrefix: "SEO proof page" },
  { outputType: "ad_creative", contentType: "facebook_ad", titlePrefix: "Ad proof angle" }
] as const;

export function proofContentBody(kind: string, proof: ProofRow) {
  const location = [proof.city, proof.state].filter(Boolean).join(", ");
  const service = proof.service_type || proof.title || "completed service";
  const customer = proof.permission_use_name && proof.customer_name ? proof.customer_name : "a customer";
  const story = proof.story_text || proof.result_summary || "Customer proof was submitted and is ready for review.";

  if (kind === "gbp_post") {
    return `Draft Google Business Profile post:\n\nRecent ${service}${location && proof.permission_use_location ? ` in ${location}` : ""}. ${story}\n\nReview photos, consent, and every claim before publishing.`;
  }
  if (kind === "facebook_post") {
    return `Draft Facebook post:\n\nAnother completed ${service}${location && proof.permission_use_location ? ` in ${location}` : ""}. ${story}\n\nAdd approved before/after photos before posting.`;
  }
  if (kind === "seo_page") {
    return `Draft local case-study page outline:\n\nTitle: ${service}${location && proof.permission_use_location ? ` in ${location}` : ""}\n\nUse this customer proof as supporting evidence after approval.\n\nSections:\n- The problem or project\n- Work completed\n- Result\n- Approved customer quote\n- Service area CTA\n\nDo not publish until details, consent, and quality review pass.`;
  }
  return `Draft ad creative:\n\nHook: Need help with ${service}${location && proof.permission_use_location ? ` in ${location}` : ""}?\nProof angle: Real customer result from ${customer}.\nBody: ${story}\nCTA: Request a quote.\n\nConfirm claims, permissions, offer, and ad-account policy before use.`;
}

export async function prepareProofContentDrafts(input: { tenantId: string; submissionId?: string; limit?: number }) {
  const proofResult = await queryPostgres<ProofRow>(
    `
    select id, brand_id, title, customer_name, service_type, city, state, story_text,
      result_summary, rating, permission_marketing, permission_use_name, permission_use_location
    from public.ugc_submissions
    where tenant_id = $1 and status = 'approved' and permission_marketing = true and brand_id is not null
      and ($2::uuid is null or id = $2)
    order by updated_at asc
    limit $3
    `,
    [input.tenantId, input.submissionId ?? null, Math.max(1, Math.min(input.limit ?? 20, 100))]
  );

  let prepared = 0;
  for (const proof of proofResult?.rows ?? []) {
    for (const output of proofOutputs) {
      const existing = await queryPostgres<{ id: string }>(
        `select id from public.ugc_content_outputs
         where tenant_id=$1 and submission_id=$2 and output_type=$3 and status <> 'archived' limit 1`,
        [input.tenantId, proof.id, output.outputType]
      );
      if (existing?.rows[0]) continue;

      const title = `${output.titlePrefix}: ${proof.title || "Customer proof"}`;
      const draftResult = await queryPostgres<{ id: string }>(
        `
        insert into public.ai_drafts (
          tenant_id, brand_id, content_type, title, body, metadata_json, status, risk_level
        ) values ($1,$2,$3,$4,$5,$6::jsonb,'needs_review','medium')
        returning id
        `,
        [
          input.tenantId,
          proof.brand_id,
          output.contentType,
          title,
          proofContentBody(output.outputType, proof),
          JSON.stringify({
            source: "ugc_proof",
            submissionId: proof.id,
            generatedBy: "shared_proof_content_service",
            livePublishing: false,
            consent: {
              marketing: true,
              useName: proof.permission_use_name,
              useLocation: proof.permission_use_location
            }
          })
        ]
      );
      const draftId = draftResult?.rows[0]?.id;
      if (!draftId) continue;

      const inserted = await queryPostgres(
        `
        insert into public.ugc_content_outputs (
          tenant_id, brand_id, submission_id, ai_draft_id, output_type, status, title, summary, metadata_json
        )
        select $1,$2,$3,$4,$5,'needs_review',$6,
          'Prepared from approved customer proof. Review before public use.',
          '{"generatedWithoutLivePublishing":true,"consentVerified":true}'::jsonb
        where not exists (
          select 1 from public.ugc_content_outputs
          where tenant_id=$1 and submission_id=$3 and output_type=$5 and status <> 'archived'
        )
        `,
        [input.tenantId, proof.brand_id, proof.id, draftId, output.outputType, title]
      );
      prepared += Number(inserted?.rowCount ?? 0);
    }
  }
  return { proofsChecked: proofResult?.rows.length ?? 0, draftsPrepared: prepared };
}

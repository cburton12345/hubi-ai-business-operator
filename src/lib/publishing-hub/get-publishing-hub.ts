import { queryPostgres } from "@/lib/db/postgres";
import { getPublicFormRows } from "@/lib/forms/get-public-forms";
import { getHostedGrowthPages } from "@/lib/sites/hosted-growth-pages";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type PublishingHubDraft = {
  id: string;
  title: string;
  contentType: string;
  status: string;
  riskLevel: string;
  createdAt: string;
};

export type PublishingHubDashboard = {
  metrics: {
    activeForms: number;
    hostedPages: number;
    publishedPages: number;
    pagesWithForms: number;
    seoDrafts: number;
    draftsNeedingReview: number;
    scheduledOrApproved: number;
    canonicalPublications: number;
    destinationPlans: number;
    destinationsNeedingAttention: number;
  };
  primaryFormUrl: string;
  trackedFormUrl: string;
  drafts: PublishingHubDraft[];
  recentDistributions: Array<{
    id: string;
    title: string;
    publicationType: string;
    status: string;
    destinations: number;
    succeeded: number;
    needsAttention: number;
    createdAt: string;
  }>;
};

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live";

function firstFormUrl(publicKey: string) {
  return `${appUrl}/forms/${publicKey}`;
}

export async function getPublishingHubDashboard(): Promise<PublishingHubDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [forms, hostedPages, draftResult, queueResult, distributionMetrics, recentDistributions] = await Promise.all([
    getPublicFormRows(),
    getHostedGrowthPages(),
    queryPostgres<{
      id: string;
      title: string;
      content_type: string;
      status: string;
      risk_level: string;
      created_at: Date;
    }>(
      `
      select id, title, content_type, status, risk_level, created_at
      from public.ai_drafts
      where tenant_id = $1
        and content_type in ('blog', 'city_page', 'service_page', 'gbp_post', 'landing_page', 'social_post')
      order by created_at desc
      limit 12
      `,
      [workspaceId]
    ),
    queryPostgres<{ count: string }>(
      `
      select count(*)::text
      from public.publishing_queue
      where tenant_id = $1 and queue_status in ('approved', 'scheduled', 'needs_approval')
      `,
      [workspaceId]
    ),
    queryPostgres<{ publications: string; destinations: string; needs_attention: string }>(
      `select
         (select count(*) from public.distribution_publications where tenant_id=$1)::text as publications,
         (select count(*) from public.distribution_destinations where tenant_id=$1)::text as destinations,
         (select count(*) from public.distribution_destinations where tenant_id=$1 and status in ('needs_connection','needs_approval','needs_human','failed'))::text as needs_attention`,
      [workspaceId]
    ),
    queryPostgres<{
      id: string; title: string; publication_type: string; status: string; destination_count: string;
      succeeded_count: string; needs_attention_count: string; created_at: Date;
    }>(
      `select p.id,p.title,p.publication_type,p.status,p.created_at,
         count(d.id)::text as destination_count,
         count(d.id) filter (where d.status='succeeded')::text as succeeded_count,
         count(d.id) filter (where d.status in ('needs_connection','needs_approval','needs_human','failed'))::text as needs_attention_count
       from public.distribution_publications p
       left join public.distribution_destinations d on d.publication_id=p.id and d.tenant_id=p.tenant_id
       where p.tenant_id=$1
       group by p.id
       order by p.created_at desc
       limit 10`,
      [workspaceId]
    )
  ]);

  const activeForms = forms.filter((form) => form.active);
  const primaryForm = activeForms[0] ?? forms[0];
  const primaryFormUrl = primaryForm ? firstFormUrl(primaryForm.publicKey) : `${appUrl}/forms/YOUR_FORM_KEY`;
  const trackedFormUrl = `${primaryFormUrl}?utm_source=website&utm_medium=button&utm_campaign=request_quote`;
  const drafts = (draftResult?.rows ?? []).map((draft) => ({
    id: draft.id,
    title: draft.title,
    contentType: draft.content_type,
    status: draft.status,
    riskLevel: draft.risk_level,
    createdAt: draft.created_at.toISOString()
  }));

  return {
    metrics: {
      activeForms: activeForms.length,
      hostedPages: hostedPages.length,
      publishedPages: hostedPages.filter((page) => page.status === "published").length,
      pagesWithForms: hostedPages.filter((page) => page.formPublicKey).length,
      seoDrafts: drafts.length,
      draftsNeedingReview: drafts.filter((draft) => draft.status === "needs_review" || draft.status === "draft").length,
      scheduledOrApproved: Number(queueResult?.rows[0]?.count ?? 0)
      ,canonicalPublications: Number(distributionMetrics?.rows[0]?.publications ?? 0)
      ,destinationPlans: Number(distributionMetrics?.rows[0]?.destinations ?? 0)
      ,destinationsNeedingAttention: Number(distributionMetrics?.rows[0]?.needs_attention ?? 0)
    },
    primaryFormUrl,
    trackedFormUrl,
    drafts,
    recentDistributions: (recentDistributions?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      publicationType: row.publication_type,
      status: row.status,
      destinations: Number(row.destination_count),
      succeeded: Number(row.succeeded_count),
      needsAttention: Number(row.needs_attention_count),
      createdAt: row.created_at.toISOString()
    }))
  };
}

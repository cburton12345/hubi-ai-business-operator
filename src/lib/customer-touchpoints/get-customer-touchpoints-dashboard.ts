import { getPublicFormRows, type PublicFormRow } from "@/lib/forms/get-public-forms";
import { getHostedGrowthPages, type HostedGrowthPageRow } from "@/lib/sites/hosted-growth-pages";
import { queryPostgres } from "@/lib/db/postgres";
import { getWebsiteGraderReports } from "@/lib/website-grader/get-website-grader-reports";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live";

export type TouchpointRow = {
  id: string;
  title: string;
  detail: string;
  status: string;
  href: string;
  publicHref: string | null;
};

export type CustomerTouchpointsDashboard = {
  appUrl: string;
  metrics: {
    publicForms: number;
    hostedPages: number;
    publishedPages: number;
    portalLinks: number;
    proofLinks: number;
    paymentLinks: number;
    graderReports: number;
    accessRequests: number;
    workerIntake: number;
  };
  setupSteps: {
    title: string;
    detail: string;
    href: string;
    status: string;
  }[];
  forms: PublicFormRow[];
  pages: HostedGrowthPageRow[];
  portalLinks: TouchpointRow[];
  proofLinks: TouchpointRow[];
  paymentLinks: TouchpointRow[];
  publicGrowth: TouchpointRow[];
};

function fullUrl(path: string) {
  if (path.startsWith("http")) return path;
  return `${appUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function getCustomerTouchpointsDashboard(): Promise<CustomerTouchpointsDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [forms, pages, grader, countsResult, portalResult, proofResult, paymentResult] = await Promise.all([
    getPublicFormRows(),
    getHostedGrowthPages(),
    getWebsiteGraderReports(),
    queryPostgres<{
      access_requests: string;
      portal_links: string;
      proof_links: string;
      payment_links: string;
      worker_intake: string;
    }>(
      `
      select
        (select count(*) from public.access_requests where status <> 'spam')::text as access_requests,
        (select count(*) from public.customer_portal_access where tenant_id = $1 and enabled = true)::text as portal_links,
        (select count(*) from public.ugc_capture_requests where tenant_id = $1 and status <> 'expired')::text as proof_links,
        (select count(*) from public.service_invoice_payment_links where tenant_id = $1 and status <> 'canceled')::text as payment_links,
        (select count(*) from public.labor_worker_availability where tenant_id = $1 and source = 'public_form' and status <> 'archived')::text as worker_intake
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      public_token: string;
      customer_name: string;
      status: string;
      last_viewed_at: Date | null;
      expires_at: Date | null;
    }>(
      `
      select a.id, a.public_token, c.name as customer_name,
        case
          when a.expires_at is not null and a.expires_at <= now() then 'expired'
          when a.last_viewed_at is not null then 'viewed'
          else 'ready'
        end as status,
        a.last_viewed_at,
        a.expires_at
      from public.customer_portal_access a
      join public.customers c on c.id = a.customer_id and c.tenant_id = a.tenant_id
      where a.tenant_id = $1 and a.enabled = true
      order by coalesce(a.last_viewed_at, a.created_at) desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      public_token: string;
      request_type: string;
      status: string;
      customer_name: string | null;
      job_title: string | null;
    }>(
      `
      select r.id, r.public_token, r.request_type, r.status, c.name as customer_name, j.title as job_title
      from public.ugc_capture_requests r
      left join public.customers c on c.id = r.customer_id and c.tenant_id = r.tenant_id
      left join public.service_jobs j on j.id = r.job_id and j.tenant_id = r.tenant_id
      where r.tenant_id = $1 and r.status <> 'expired'
      order by r.created_at desc
      limit 8
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      invoice_title: string;
      customer_name: string;
      provider: string;
      status: string;
      payment_url: string | null;
    }>(
      `
      select l.id, i.title as invoice_title, c.name as customer_name, l.provider, l.status, l.payment_url
      from public.service_invoice_payment_links l
      join public.service_invoices i on i.id = l.invoice_id
      join public.customers c on c.id = l.customer_id
      where l.tenant_id = $1 and l.status <> 'canceled'
      order by l.created_at desc
      limit 8
      `,
      [workspaceId]
    )
  ]);

  const counts = countsResult?.rows[0];
  const activeForms = forms.filter((form) => form.active);
  const publishedPages = pages.filter((page) => page.status === "published");
  const primaryForm = activeForms[0] ?? forms[0];
  const workerIntakeHref = primaryForm ? fullUrl(`/workers/${primaryForm.publicKey}`) : null;

  const setupSteps = [
    {
      title: "Add a quote path",
      detail: primaryForm ? "A public lead form exists. Add it to the website or hosted pages." : "Create a lead form before sending traffic.",
      href: "/app/forms",
      status: primaryForm ? "ready" : "needs setup"
    },
    {
      title: "Add website tracking",
      detail: "Use the website connector script and tracked form links so leads keep source, page, referrer, and campaign data.",
      href: "/app/website",
      status: "ready"
    },
    {
      title: "Publish or export pages",
      detail: publishedPages.length > 0 ? "Published hosted pages are available." : "Prepare hosted pages or export approved drafts to the customer website.",
      href: "/app/publishing-hub",
      status: publishedPages.length > 0 ? "ready" : "draft"
    },
    {
      title: "Enable customer links",
      detail: "Portal, proof, and Stripe payment links should be shared only after the record is correct and payments are configured.",
      href: "/app/service-command",
      status: "review"
    },
    {
      title: "Use the public grader",
      detail: "Business Health Score can create inbound Ferocity setup conversations.",
      href: "/app/website-grader",
      status: grader.stats.reports > 0 ? "running" : "available"
    },
    {
      title: "Share worker intake when hiring",
      detail: primaryForm ? "A public worker availability link is ready for referrals, subcontractors, and MarketplacePro labor flow." : "Create an active public form first, then Ferocity can expose worker availability intake.",
      href: "/app/labor-bench",
      status: primaryForm ? "ready" : "needs setup"
    }
  ];

  return {
    appUrl,
    metrics: {
      publicForms: activeForms.length,
      hostedPages: pages.length,
      publishedPages: publishedPages.length,
      portalLinks: Number(counts?.portal_links ?? 0),
      proofLinks: Number(counts?.proof_links ?? 0),
      paymentLinks: Number(counts?.payment_links ?? 0),
      graderReports: grader.stats.reports,
      accessRequests: Number(counts?.access_requests ?? 0),
      workerIntake: Number(counts?.worker_intake ?? 0)
    },
    setupSteps,
    forms: forms.slice(0, 8),
    pages: pages.slice(0, 8),
    portalLinks: (portalResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.customer_name,
      detail: row.expires_at ? `Expires ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(row.expires_at)}` : "Customer portal access link",
      status: row.status,
      href: "/app/service",
      publicHref: fullUrl(`/portal/${row.public_token}`)
    })),
    proofLinks: (proofResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.customer_name || row.job_title || "Customer proof request",
      detail: [row.request_type.replaceAll("_", " "), row.job_title].filter(Boolean).join(" / ") || "Proof capture link",
      status: row.status,
      href: "/app/proof",
      publicHref: fullUrl(`/proof/${row.public_token}`)
    })),
    paymentLinks: (paymentResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.invoice_title,
      detail: `${row.customer_name} / ${row.provider}`,
      status: row.status,
      href: "/app/cash-collection",
      publicHref: row.payment_url
    })),
    publicGrowth: [
      {
        id: "business-health-score",
        title: "Business Health Score",
        detail: "Free public assessment that leads into Ferocity setup.",
        status: grader.stats.reports > 0 ? `${grader.stats.reports} reports` : "available",
        href: "/app/website-grader",
        publicHref: fullUrl("/business-health-score")
      },
      {
        id: "worker-intake",
        title: "Worker availability intake",
        detail: "Public path for workers, subcontractors, and referrals to submit availability for owner-approved matching.",
        status: primaryForm ? `${Number(counts?.worker_intake ?? 0)} submissions` : "needs form",
        href: "/app/labor-bench",
        publicHref: workerIntakeHref
      },
      {
        id: "start",
        title: "Start / request access",
        detail: "Public onboarding path for interested businesses.",
        status: "public",
        href: "/app/access-requests",
        publicHref: fullUrl("/start")
      },
      {
        id: "demo",
        title: "Public demo",
        detail: "Shareable product tour without private workspace data.",
        status: "public",
        href: "/app/sample-tour",
        publicHref: fullUrl("/demo")
      }
    ]
  };
}

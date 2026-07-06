import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { safeRedirect } from "@/lib/http/safe-redirect";
import { logAppError } from "@/lib/observability/log-error";
import { recordSalesOpportunity } from "@/lib/sales/record-opportunity";

const upgradeSchema = z.object({
  reportToken: z.string().trim().min(8).max(120),
  selectedPath: z.enum(["one_time", "job_tracker", "starter", "growth", "operator", "agency"])
});

type ReportRow = {
  id: string;
  report_token: string;
  email: string;
  company_name: string | null;
  score: number;
  grade_label: string;
};

function redirectTo(request: NextRequest, path: string) {
  return safeRedirect(request, path);
}

function statusForPath(selectedPath: z.infer<typeof upgradeSchema>["selectedPath"], stripeReady: boolean) {
  if (selectedPath === "job_tracker") return "manual_follow_up";
  if (selectedPath === "starter") return "included_with_starter";
  if (selectedPath === "growth") return "included_with_growth";
  if (selectedPath === "operator" || selectedPath === "agency") return "manual_follow_up";
  return stripeReady ? "checkout_pending" : "stripe_not_ready";
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parsed = upgradeSchema.safeParse({
    reportToken: String(formData.get("reportToken") ?? ""),
    selectedPath: String(formData.get("selectedPath") ?? "")
  });

  if (!parsed.success) {
    return redirectTo(request, "/business-health-score?upgrade=invalid");
  }

  const reportResult = await queryPostgres<ReportRow>(
    `
    select id, report_token, email, company_name, score, grade_label
    from public.website_grader_reports
    where report_token = $1 and status <> 'spam'
    limit 1
    `,
    [parsed.data.reportToken]
  );

  const report = reportResult?.rows[0];
  if (!report) {
    return redirectTo(request, "/business-health-score?upgrade=missing_report");
  }

  const reportPriceId = env.STRIPE_PRICE_ID_AI_GROWTH_REPORT;
  const stripeReady = Boolean(env.STRIPE_SECRET_KEY && reportPriceId);
  const upgradeStatus = statusForPath(parsed.data.selectedPath, stripeReady);
  const amountCents = parsed.data.selectedPath === "one_time" ? 4900 : 0;
  const selectedPlan =
    parsed.data.selectedPath === "one_time" ? "business_autopilot_blueprint" : parsed.data.selectedPath === "agency" ? "pro_agency" : parsed.data.selectedPath;

  const upgradeResult = await queryPostgres<{ id: string }>(
    `
    insert into public.business_health_report_upgrades (
      report_id, report_token, email, upgrade_status, selected_path, selected_plan, amount_cents, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    returning id
    `,
    [
      report.id,
      report.report_token,
      report.email,
      upgradeStatus,
      parsed.data.selectedPath,
      selectedPlan,
      amountCents,
      JSON.stringify({
        source: "business_health_score_report",
        companyName: report.company_name,
        score: report.score,
        gradeLabel: report.grade_label,
        stripeReady,
        noLiveCheckout: !stripeReady,
        missingStripe: {
          STRIPE_SECRET_KEY: !env.STRIPE_SECRET_KEY,
          STRIPE_PRICE_ID_AI_GROWTH_REPORT: !reportPriceId
        }
      })
    ]
  );

  const upgradeId = upgradeResult?.rows[0]?.id;

  await recordSalesOpportunity({
    externalEventId: `business-grader-upgrade:${report.report_token}:${upgradeId ?? parsed.data.selectedPath}`,
    source: "business_grader",
    title: "Business Grader upgrade request",
    summary: `${report.company_name || report.email} selected ${selectedPlan} from a Business Grader report scored ${report.score}/100.`,
    email: report.email,
    companyName: report.company_name,
    score: report.score,
    reportToken: report.report_token,
    requestedPlan: selectedPlan,
    actionHref: `/business-health-score/report/${encodeURIComponent(report.report_token)}/upgrade`,
    moneyCents:
      amountCents ||
      (selectedPlan === "growth"
        ? 19900
        : selectedPlan === "operator"
          ? 39900
          : selectedPlan === "starter"
            ? 7900
            : selectedPlan === "job_tracker"
              ? 3900
              : 0),
    metadata: {
      upgradeId,
      selectedPath: parsed.data.selectedPath,
      upgradeStatus,
      gradeLabel: report.grade_label,
      stripeReady
    }
  });

  if (parsed.data.selectedPath === "job_tracker" || parsed.data.selectedPath === "starter" || parsed.data.selectedPath === "growth") {
    const params = new URLSearchParams({
      source: "business_health_score_report",
      plan: parsed.data.selectedPath,
      report: report.report_token,
      blueprint: "included"
    });
    return redirectTo(request, `/start?${params.toString()}`);
  }

  if (parsed.data.selectedPath === "operator" || parsed.data.selectedPath === "agency") {
    const params = new URLSearchParams({
      source: "business_health_score_report",
      plan: selectedPlan,
      report: report.report_token,
      blueprint: "manual"
    });
    return redirectTo(request, `/start?${params.toString()}`);
  }

  if (!stripeReady) {
    await logAppError({
      source: "api.business-health-score.upgrade",
      message: "Business Autopilot Blueprint checkout requested before Stripe one-time price was configured.",
      severity: "info",
      metadata: {
        reportToken: report.report_token,
        upgradeId,
        missing: {
          STRIPE_SECRET_KEY: !env.STRIPE_SECRET_KEY,
          STRIPE_PRICE_ID_AI_GROWTH_REPORT: !reportPriceId
        }
      }
    });
    return redirectTo(request, `/business-health-score/report/${encodeURIComponent(report.report_token)}/upgrade?status=stripe_not_ready`);
  }

  const origin = request.nextUrl.origin;
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][price]": reportPriceId!,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/business-health-score/report/${encodeURIComponent(report.report_token)}/upgrade?status=checkout_started&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/business-health-score/report/${encodeURIComponent(report.report_token)}/upgrade?status=checkout_cancelled`,
    "metadata[report_token]": report.report_token,
    "metadata[upgrade_id]": upgradeId ?? "",
    "metadata[source]": "business_health_score_report",
    "customer_email": report.email
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    const detail = await response.text();
    await logAppError({
      source: "api.business-health-score.upgrade",
      message: "Business Autopilot Blueprint Stripe checkout session creation failed.",
      severity: "warning",
      metadata: {
        reportToken: report.report_token,
        upgradeId,
        status: response.status,
        detail: detail.slice(0, 500)
      }
    });
    return redirectTo(request, `/business-health-score/report/${encodeURIComponent(report.report_token)}/upgrade?status=stripe_error`);
  }

  const session = (await response.json()) as { id?: string; url?: string };
  if (session.id) {
    await queryPostgres(
      `
      update public.business_health_report_upgrades
      set stripe_checkout_session_id = $2,
        metadata_json = metadata_json || $3::jsonb
      where id = $1
      `,
      [upgradeId, session.id, JSON.stringify({ stripeCheckoutStartedAt: new Date().toISOString() })]
    );
  }

  if (!session.url) {
    return redirectTo(request, `/business-health-score/report/${encodeURIComponent(report.report_token)}/upgrade?status=stripe_missing_url`);
  }

  return NextResponse.redirect(session.url, 303);
}

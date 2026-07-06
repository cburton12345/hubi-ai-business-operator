import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomSessionToken } from "@/lib/auth/password";
import { queryPostgres } from "@/lib/db/postgres";
import { safeRedirect } from "@/lib/http/safe-redirect";
import { logAppError } from "@/lib/observability/log-error";
import { recordSalesOpportunity } from "@/lib/sales/record-opportunity";
import { gradeWebsiteUrl, type OperationsAssessmentInput } from "@/lib/website-grader/grader";

const operationAnswerSchema = z.enum(["strong", "some", "missing", "not_sure"]);

const graderSchema = z.object({
  websiteUrl: z.string().trim().max(500).optional(),
  googleBusinessProfileUrl: z.string().trim().max(500).optional(),
  email: z.string().trim().email(),
  name: z.string().trim().max(160).optional(),
  companyName: z.string().trim().max(180).optional(),
  businessType: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(80).optional(),
  serviceArea: z.string().trim().max(220).optional(),
  leadResponse: operationAnswerSchema.optional(),
  followUp: operationAnswerSchema.optional(),
  reviews: operationAnswerSchema.optional(),
  payments: operationAnswerSchema.optional(),
  operations: operationAnswerSchema.optional(),
  hiring: operationAnswerSchema.optional(),
  retention: operationAnswerSchema.optional(),
  marketingChannels: z.array(z.string().trim().max(80)).optional(),
  consentToContact: z.literal("on"),
  website: z.string().max(0).optional()
});

function emptyToNull(value: string | null | undefined) {
  return value?.trim() ? value.trim() : null;
}

function optionalUrl(value: string | null | undefined) {
  if (!value?.trim()) return "";
  try {
    return new URL(value).toString();
  } catch {
    return "__invalid__";
  }
}

function optionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value : undefined;
}

function redirectTo(request: NextRequest, path: string) {
  return safeRedirect(request, path);
}

function token() {
  return `wgr_${randomSessionToken().slice(0, 24).toLowerCase()}`;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const websiteUrl = optionalUrl(String(formData.get("websiteUrl") ?? ""));
  const googleBusinessProfileUrl = optionalUrl(String(formData.get("googleBusinessProfileUrl") ?? ""));
  const parsed = graderSchema.safeParse({
    websiteUrl,
    googleBusinessProfileUrl,
    email: optionalFormString(formData, "email"),
    name: optionalFormString(formData, "name"),
    companyName: optionalFormString(formData, "companyName"),
    businessType: optionalFormString(formData, "businessType"),
    city: optionalFormString(formData, "city"),
    state: optionalFormString(formData, "state"),
    serviceArea: optionalFormString(formData, "serviceArea"),
    leadResponse: optionalFormString(formData, "leadResponse"),
    followUp: optionalFormString(formData, "followUp"),
    reviews: optionalFormString(formData, "reviews"),
    payments: optionalFormString(formData, "payments"),
    operations: optionalFormString(formData, "operations"),
    hiring: optionalFormString(formData, "hiring"),
    retention: optionalFormString(formData, "retention"),
    marketingChannels: formData.getAll("marketingChannels").map(String),
    consentToContact: optionalFormString(formData, "consentToContact"),
    website: optionalFormString(formData, "website") ?? ""
  });

  if (!parsed.success || parsed.data.website || websiteUrl === "__invalid__" || googleBusinessProfileUrl === "__invalid__") {
    return redirectTo(request, "/business-health-score?error=1");
  }

  const operations: OperationsAssessmentInput = {
    businessName: parsed.data.companyName,
    googleBusinessProfileUrl: parsed.data.googleBusinessProfileUrl,
    industry: parsed.data.businessType,
    city: parsed.data.city,
    state: parsed.data.state,
    serviceArea: parsed.data.serviceArea,
    leadResponse: parsed.data.leadResponse,
    followUp: parsed.data.followUp,
    reviews: parsed.data.reviews,
    payments: parsed.data.payments,
    operations: parsed.data.operations,
    hiring: parsed.data.hiring,
    retention: parsed.data.retention,
    marketingChannels: parsed.data.marketingChannels
  };
  const submittedWebsiteUrl = parsed.data.websiteUrl || "";
  const storedWebsiteUrl = submittedWebsiteUrl || `business-health-score:${randomSessionToken().slice(0, 12).toLowerCase()}`;
  const gradeResult = await gradeWebsiteUrl(submittedWebsiteUrl, operations);
  const reportToken = token();

  if (!gradeResult.ok) {
    const result = await queryPostgres<{ report_token: string }>(
      `
      insert into public.website_grader_reports (
        report_token, status, website_url, email, name, company_name, business_type,
        score, grade_label, findings_json, recommended_steps_json, metadata_json, ip_address, user_agent
      )
      values ($1, 'failed', $2, $3, $4, $5, $6, 0, 'Scan Failed', '[]'::jsonb, '[]'::jsonb, $7::jsonb, $8, $9)
      returning report_token
      `,
      [
        reportToken,
        storedWebsiteUrl,
        parsed.data.email,
        emptyToNull(parsed.data.name),
        emptyToNull(parsed.data.companyName),
        emptyToNull(parsed.data.businessType),
        JSON.stringify({
          error: gradeResult.message,
          source: "business_health_score",
          assessmentType: "business_health_score",
          consentToContact: true,
          operations
        }),
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        request.headers.get("user-agent")
      ]
    );
    await logAppError({
      source: "public.website_grader.scan",
      severity: "warning",
      message: gradeResult.message,
      metadata: { websiteUrl: submittedWebsiteUrl, reportToken: result?.rows[0]?.report_token ?? reportToken }
    });
    await recordSalesOpportunity({
      externalEventId: `business-grader:${result?.rows[0]?.report_token ?? reportToken}`,
      source: "business_grader",
      title: "Business Grader report needs follow-up",
      summary: `${parsed.data.companyName || parsed.data.email} tried the Business Grader, but the website scan failed. Follow up and offer a setup review.`,
      email: parsed.data.email,
      name: parsed.data.name,
      companyName: parsed.data.companyName,
      businessType: parsed.data.businessType,
      websiteUrl: submittedWebsiteUrl,
      reportToken: result?.rows[0]?.report_token ?? reportToken,
      actionHref: `/business-health-score/report/${encodeURIComponent(result?.rows[0]?.report_token ?? reportToken)}`,
      metadata: {
        scanStatus: "failed",
        error: gradeResult.message,
        operations
      }
    });
    return redirectTo(request, `/business-health-score/report/${encodeURIComponent(result?.rows[0]?.report_token ?? reportToken)}?scan=failed`);
  }

  const result = await queryPostgres<{ report_token: string }>(
    `
    insert into public.website_grader_reports (
      report_token, status, website_url, final_url, email, name, company_name, business_type,
      score, grade_label, extraction_json, findings_json, recommended_steps_json, metadata_json, ip_address, user_agent
    )
    values ($1, 'completed', $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15)
    returning report_token
    `,
    [
      reportToken,
      storedWebsiteUrl,
      gradeResult.analysis.finalUrl,
      parsed.data.email,
      emptyToNull(parsed.data.name),
      emptyToNull(parsed.data.companyName),
      emptyToNull(parsed.data.businessType),
      gradeResult.report.score,
      gradeResult.report.gradeLabel,
      JSON.stringify(gradeResult.analysis),
      JSON.stringify(gradeResult.report.findings),
      JSON.stringify(gradeResult.report.recommendedSteps),
      JSON.stringify({
        source: "business_health_score",
        assessmentType: "business_health_score",
        consentToContact: true,
        operations,
        categoryScores: gradeResult.report.categories,
        strengths: gradeResult.report.strengths,
        weaknesses: gradeResult.report.weaknesses,
        opportunities: gradeResult.report.opportunities,
        missedRevenue: gradeResult.report.missedRevenue,
        ecosystemRecommendations: gradeResult.report.ecosystemRecommendations,
        noPublishing: true,
        noCustomerMessages: true,
        generatedAt: new Date().toISOString()
      }),
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      request.headers.get("user-agent")
    ]
  );

  await recordSalesOpportunity({
    externalEventId: `business-grader:${result?.rows[0]?.report_token ?? reportToken}`,
    source: "business_grader",
    title: "New Business Grader lead",
    summary: `${parsed.data.companyName || parsed.data.email} scored ${gradeResult.report.score}/100. Recommended path: follow up and turn the report into a Ferocity setup plan.`,
    email: parsed.data.email,
    name: parsed.data.name,
    companyName: parsed.data.companyName,
    businessType: parsed.data.businessType,
    websiteUrl: submittedWebsiteUrl,
    score: gradeResult.report.score,
    reportToken: result?.rows[0]?.report_token ?? reportToken,
    actionHref: `/business-health-score/report/${encodeURIComponent(result?.rows[0]?.report_token ?? reportToken)}`,
    moneyCents: Math.max(0, Math.round((gradeResult.report.missedRevenue.low + gradeResult.report.missedRevenue.high) / 2) * 100),
    metadata: {
      gradeLabel: gradeResult.report.gradeLabel,
      categoryScores: gradeResult.report.categories,
      missedRevenue: gradeResult.report.missedRevenue,
      operations
    }
  });

  return redirectTo(request, `/business-health-score/report/${encodeURIComponent(result?.rows[0]?.report_token ?? reportToken)}`);
}

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/business-health-score", request.url));
}

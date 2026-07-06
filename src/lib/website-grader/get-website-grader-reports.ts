import { queryPostgres } from "@/lib/db/postgres";

export type WebsiteGraderReportRow = {
  id: string;
  reportToken: string;
  status: string;
  websiteUrl: string;
  email: string;
  companyName: string;
  businessType: string;
  city: string;
  state: string;
  score: number;
  gradeLabel: string;
  createdAt: string;
  topFinding: string;
  upgradeStatus: string;
  selectedPath: string;
  selectedPlan: string;
  lastUpgradeAt: string | null;
  leadStage: "new" | "hot" | "plan_interest" | "manual_follow_up" | "failed_scan" | "nurture";
};

export type WebsiteGraderFilters = {
  industry?: string;
  state?: string;
  scoreRange?: string;
};

export type WebsiteGraderStats = {
  reports: number;
  weakSites: number;
  averageScore: number;
  failedScans: number;
  hotLeads: number;
  upgradeRequests: number;
  planInterest: number;
  manualFollowUp: number;
};

function scoreClause(scoreRange?: string) {
  if (scoreRange === "red") return "and score between 0 and 49";
  if (scoreRange === "yellow") return "and score between 50 and 74";
  if (scoreRange === "green") return "and score between 75 and 100";
  return "";
}

export async function getWebsiteGraderReports(filters: WebsiteGraderFilters = {}): Promise<{ rows: WebsiteGraderReportRow[]; stats: WebsiteGraderStats }> {
  const params: string[] = [];
  const whereParts = ["status <> 'spam'"];
  if (filters.industry) {
    params.push(filters.industry);
    whereParts.push(`lower(coalesce(business_type, '')) = lower($${params.length})`);
  }
  if (filters.state) {
    params.push(filters.state);
    whereParts.push(`lower(coalesce(metadata_json->'operations'->>'state', '')) = lower($${params.length})`);
  }
  const scoreFilter = scoreClause(filters.scoreRange);
  if (scoreFilter) whereParts.push(scoreFilter.replace(/^and /, ""));
  const whereSql = whereParts.join(" and ");

  const [rowsResult, statsResult] = await Promise.all([
    queryPostgres<{
      id: string;
      report_token: string;
      status: string;
      website_url: string;
      email: string;
      company_name: string | null;
      business_type: string | null;
      city: string | null;
      state: string | null;
      score: number;
      grade_label: string;
      created_at: Date;
      top_finding: string | null;
      upgrade_status: string | null;
      selected_path: string | null;
      selected_plan: string | null;
      last_upgrade_at: Date | null;
    }>(
      `
      with latest_upgrade as (
        select distinct on (report_token)
          report_token,
          upgrade_status,
          selected_path,
          selected_plan,
          created_at
        from public.business_health_report_upgrades
        order by report_token, created_at desc
      )
      select
        r.id,
        r.report_token,
        r.status,
        r.website_url,
        r.email,
        r.company_name,
        r.business_type,
        r.metadata_json->'operations'->>'city' as city,
        r.metadata_json->'operations'->>'state' as state,
        r.score,
        r.grade_label,
        r.created_at,
        r.findings_json->0->>'title' as top_finding,
        u.upgrade_status,
        u.selected_path,
        u.selected_plan,
        u.created_at as last_upgrade_at
      from public.website_grader_reports r
      left join latest_upgrade u on u.report_token = r.report_token
      where ${whereSql.replaceAll("score", "r.score").replaceAll("status", "r.status").replaceAll("business_type", "r.business_type").replaceAll("metadata_json", "r.metadata_json")}
      order by r.created_at desc
      limit 100
      `,
      params
    ),
    queryPostgres<{
      reports: string;
      weak_sites: string;
      average_score: string | null;
      failed_scans: string;
      hot_leads: string;
      upgrade_requests: string;
      plan_interest: string;
      manual_follow_up: string;
    }>(
      `
      select
        count(*)::text as reports,
        count(*) filter (where score < 70 and status = 'completed')::text as weak_sites,
        round(avg(score) filter (where status = 'completed'))::text as average_score,
        count(*) filter (where status = 'failed')::text as failed_scans,
        count(*) filter (where score < 70 and status = 'completed' and created_at >= now() - interval '14 days')::text as hot_leads,
        (
          select count(*)
          from public.business_health_report_upgrades u
          join public.website_grader_reports r on r.report_token = u.report_token
          where ${whereSql}
        )::text as upgrade_requests,
        (
          select count(*)
          from public.business_health_report_upgrades u
          join public.website_grader_reports r on r.report_token = u.report_token
          where ${whereSql}
            and u.selected_path in ('starter','growth','operator','agency')
        )::text as plan_interest,
        (
          select count(*)
          from public.business_health_report_upgrades u
          join public.website_grader_reports r on r.report_token = u.report_token
          where ${whereSql}
            and u.upgrade_status in ('stripe_not_ready','manual_follow_up')
        )::text as manual_follow_up
      from public.website_grader_reports
      where ${whereSql}
      `,
      params
    )
  ]);

  const stats = statsResult?.rows[0];
  const leadStage = (row: {
    status: string;
    score: number;
    upgrade_status: string | null;
    selected_path: string | null;
    created_at: Date;
  }): WebsiteGraderReportRow["leadStage"] => {
    if (row.status === "failed") return "failed_scan";
    if (row.upgrade_status === "manual_follow_up" || row.upgrade_status === "stripe_not_ready") return "manual_follow_up";
    if (row.selected_path && row.selected_path !== "one_time") return "plan_interest";
    if (row.upgrade_status) return "hot";
    const ageDays = (Date.now() - row.created_at.getTime()) / 86400000;
    if (row.score < 70 && ageDays <= 14) return "hot";
    if (ageDays <= 14) return "new";
    return "nurture";
  };

  return {
    rows: (rowsResult?.rows ?? []).map((row) => ({
      id: row.id,
      reportToken: row.report_token,
      status: row.status,
      websiteUrl: row.website_url,
      email: row.email,
      companyName: row.company_name ?? "",
      businessType: row.business_type ?? "",
      city: row.city ?? "",
      state: row.state ?? "",
      score: row.score,
      gradeLabel: row.grade_label,
      createdAt: row.created_at.toISOString(),
      topFinding: row.top_finding ?? "No finding recorded",
      upgradeStatus: row.upgrade_status ?? "",
      selectedPath: row.selected_path ?? "",
      selectedPlan: row.selected_plan ?? "",
      lastUpgradeAt: row.last_upgrade_at?.toISOString() ?? null,
      leadStage: leadStage(row)
    })),
    stats: {
      reports: Number(stats?.reports ?? 0),
      weakSites: Number(stats?.weak_sites ?? 0),
      averageScore: Number(stats?.average_score ?? 0),
      failedScans: Number(stats?.failed_scans ?? 0),
      hotLeads: Number(stats?.hot_leads ?? 0),
      upgradeRequests: Number(stats?.upgrade_requests ?? 0),
      planInterest: Number(stats?.plan_interest ?? 0),
      manualFollowUp: Number(stats?.manual_follow_up ?? 0)
    }
  };
}

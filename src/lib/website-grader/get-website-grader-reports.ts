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
    }>(
      `
      select
        id,
        report_token,
        status,
        website_url,
        email,
        company_name,
        business_type,
        metadata_json->'operations'->>'city' as city,
        metadata_json->'operations'->>'state' as state,
        score,
        grade_label,
        created_at,
        findings_json->0->>'title' as top_finding
      from public.website_grader_reports
      where ${whereSql}
      order by created_at desc
      limit 100
      `,
      params
    ),
    queryPostgres<{
      reports: string;
      weak_sites: string;
      average_score: string | null;
      failed_scans: string;
    }>(
      `
      select
        count(*)::text as reports,
        count(*) filter (where score < 70 and status = 'completed')::text as weak_sites,
        round(avg(score) filter (where status = 'completed'))::text as average_score,
        count(*) filter (where status = 'failed')::text as failed_scans
      from public.website_grader_reports
      where ${whereSql}
      `,
      params
    )
  ]);

  const stats = statsResult?.rows[0];
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
      topFinding: row.top_finding ?? "No finding recorded"
    })),
    stats: {
      reports: Number(stats?.reports ?? 0),
      weakSites: Number(stats?.weak_sites ?? 0),
      averageScore: Number(stats?.average_score ?? 0),
      failedScans: Number(stats?.failed_scans ?? 0)
    }
  };
}

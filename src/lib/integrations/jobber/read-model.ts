import { createHash } from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";
import { getFreshProviderAccessToken } from "@/lib/integrations/provider-access-token";
import { queryJobberGraphQL, type JobberGraphQLResponse } from "@/lib/integrations/jobber/client";

type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type JobberNode = Record<string, unknown> & { id: string };
type ResourceConnection = { nodes: JobberNode[]; pageInfo: PageInfo };

type ResourceSpec = {
  objectType: "client" | "request" | "quote" | "job" | "invoice";
  root: "clients" | "requests" | "quotes" | "jobs" | "invoices";
  fields: string;
};

export const JOBBER_ANALYSIS_RESOURCES: ResourceSpec[] = [
  { objectType: "client", root: "clients", fields: "id name email phone isLead isArchived balance createdAt updatedAt jobberWebUri" },
  { objectType: "request", root: "requests", fields: "id title requestStatus source contactName companyName email phone isScheduled createdAt updatedAt jobberWebUri client { id } property { id }" },
  { objectType: "quote", root: "quotes", fields: "id title quoteNumber quoteStatus sentAt transitionedAt createdAt updatedAt jobberWebUri client { id } property { id } request { id }" },
  { objectType: "job", root: "jobs", fields: "id title jobNumber jobStatus jobType startAt endAt completedAt total invoicedTotal uninvoicedTotal createdAt updatedAt jobberWebUri client { id } property { id } quote { id } request { id }" },
  { objectType: "invoice", root: "invoices", fields: "id subject invoiceNumber invoiceStatus issuedDate dueDate receivedDate createdAt updatedAt jobberWebUri client { id }" }
];

function resourceQuery(spec: ResourceSpec) {
  return `query Ferocity${spec.objectType}Read($first: Int!, $after: String) {
    ${spec.root}(first: $first, after: $after) {
      nodes { ${spec.fields} }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }`;
}

export function buildJobberResourceQuery(objectType: ResourceSpec["objectType"]) {
  const spec = JOBBER_ANALYSIS_RESOURCES.find((item) => item.objectType === objectType);
  if (!spec) throw new Error("Unsupported Jobber analysis resource.");
  return resourceQuery(spec);
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function relatedId(node: JobberNode, key: string) {
  const related = node[key];
  return related && typeof related === "object" ? text((related as Record<string, unknown>).id) : null;
}

function recordSummary(spec: ResourceSpec, node: JobberNode) {
  const displayName = text(node.name) ?? text(node.title) ?? text(node.subject) ?? text(node.quoteNumber) ?? text(node.invoiceNumber) ?? String(node.id);
  const status = text(node.jobStatus) ?? text(node.requestStatus) ?? text(node.quoteStatus) ?? text(node.invoiceStatus)
    ?? (typeof node.isLead === "boolean" ? (node.isLead ? "lead" : "active") : null);
  const amount = typeof node.total === "number" ? node.total : typeof node.balance === "number" ? node.balance : null;
  const summary: Record<string, unknown> = {};
  for (const key of ["email", "phone", "source", "contactName", "companyName", "jobNumber", "jobType", "quoteNumber", "invoiceNumber", "isScheduled", "isArchived", "invoicedTotal", "uninvoicedTotal", "issuedDate", "dueDate", "receivedDate", "sentAt", "transitionedAt", "startAt", "endAt", "completedAt"]) {
    if (node[key] !== null && node[key] !== undefined) summary[key] = node[key];
  }
  return {
    displayName,
    status,
    amount,
    webUrl: text(node.jobberWebUri),
    createdAt: text(node.createdAt),
    updatedAt: text(node.updatedAt),
    relationships: Object.fromEntries(["client", "property", "request", "quote"].map((key) => [key, relatedId(node, key)]).filter(([, value]) => value)),
    summary,
    version: createHash("sha256").update(JSON.stringify(node)).digest("hex")
  };
}

async function upsertRecord(input: { tenantId: string; connectionId: string; spec: ResourceSpec; node: JobberNode }) {
  const normalized = recordSummary(input.spec, input.node);
  await queryPostgres(
    `insert into public.external_service_platform_records
      (tenant_id,connection_id,provider_key,object_type,external_id,external_version,display_name,record_status,amount,web_url,related_external_ids_json,summary_json,source_created_at,source_updated_at,provider_deleted_at)
     values ($1,$2,'jobber',$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::timestamptz,$13::timestamptz,null)
     on conflict (connection_id,object_type,external_id) do update set
       external_version=excluded.external_version,display_name=excluded.display_name,record_status=excluded.record_status,
       amount=excluded.amount,web_url=excluded.web_url,related_external_ids_json=excluded.related_external_ids_json,
       summary_json=excluded.summary_json,source_created_at=excluded.source_created_at,source_updated_at=excluded.source_updated_at,
       provider_deleted_at=null,updated_at=now()`,
    [input.tenantId, input.connectionId, input.spec.objectType, input.node.id, normalized.version, normalized.displayName,
      normalized.status, normalized.amount, normalized.webUrl, JSON.stringify(normalized.relationships), JSON.stringify(normalized.summary),
      normalized.createdAt, normalized.updatedAt]
  );
}

export async function syncJobberReadModel(input: { tenantId: string; pageSize?: number; maxPagesPerResource?: number; fetchImpl?: typeof fetch }) {
  const connectionResult = await queryPostgres<{ id: string }>(
    "select id from public.integration_connections where tenant_id=$1 and provider='jobber' and status='connected' limit 1",
    [input.tenantId]
  );
  const connectionId = connectionResult?.rows[0]?.id;
  if (!connectionId) throw new Error("Connect Jobber before running business analysis.");
  const accessToken = await getFreshProviderAccessToken(input.tenantId, "jobber", input.fetchImpl ?? fetch);
  const pageSize = Math.min(50, Math.max(5, input.pageSize ?? 25));
  const maxPages = Math.min(20, Math.max(1, input.maxPagesPerResource ?? 4));
  const counts: Record<string, number> = {};
  const costs: Record<string, number> = {};

  for (const spec of JOBBER_ANALYSIS_RESOURCES) {
    let cursor: string | null = null;
    let completed = false;
    let pages = 0;
    counts[spec.objectType] = 0;
    costs[spec.objectType] = 0;
    while (!completed && pages < maxPages) {
      const response: JobberGraphQLResponse<Record<string, ResourceConnection>> = await queryJobberGraphQL<Record<string, ResourceConnection>>({
        accessToken,
        query: resourceQuery(spec),
        variables: { first: pageSize, after: cursor },
        fetchImpl: input.fetchImpl
      });
      const connection: ResourceConnection = response.data[spec.root];
      for (const node of connection.nodes) await upsertRecord({ tenantId: input.tenantId, connectionId, spec, node });
      counts[spec.objectType] += connection.nodes.length;
      costs[spec.objectType] += response.cost.actual ?? 0;
      cursor = connection.pageInfo.endCursor;
      completed = !connection.pageInfo.hasNextPage || !cursor;
      pages += 1;
    }
    await queryPostgres(
      `insert into public.integration_sync_cursors (tenant_id,connection_id,resource_type,cursor_value,status,last_started_at,last_completed_at,metadata_json)
       values ($1,$2,$3,$4,$5,now(),case when $5='current' then now() else null end,$6::jsonb)
       on conflict (connection_id,resource_type,external_scope) do update set cursor_value=excluded.cursor_value,status=excluded.status,
         last_started_at=excluded.last_started_at,last_completed_at=excluded.last_completed_at,metadata_json=excluded.metadata_json,updated_at=now()`,
      [input.tenantId, connectionId, `jobber_${spec.objectType}`, cursor, completed ? "current" : "paused", JSON.stringify({ pages, records: counts[spec.objectType], queryCost: costs[spec.objectType], readOnly: true })]
    );
  }
  await queryPostgres(
    `update public.integration_connections set last_checked_at=now(),metadata_json=metadata_json || $3::jsonb,updated_at=now() where id=$1 and tenant_id=$2`,
    [connectionId, input.tenantId, JSON.stringify({ lastReadSyncAt: new Date().toISOString(), lastReadSyncCounts: counts, writeBackEnabled: false })]
  );
  return { counts, costs, readOnly: true };
}

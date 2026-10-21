import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as z from "zod/v4";
import { invokeBusinessAction } from "@/lib/business-actions/gateway";
import { authenticateExternalAiBearer, type AuthenticatedExternalAiCredential } from "@/lib/mcp/credentials";
import { beginExternalToolInvocation, finishExternalToolInvocation, getExternalToolInvocation } from "@/lib/mcp/invocations";
import { sanitizeExternalText, sanitizeExternalToolOutput } from "@/lib/mcp/output-policy";
import { countReturnedRecords } from "@/lib/mcp/usage-policy";

const uuid = z.string().uuid();
const idempotencyKey = z.string().trim().min(8).max(200);
const listInput = { limit: z.number().int().min(1).max(25).default(10), cursor: uuid.optional() };
const toolOutput = {
  jobId: uuid,
  status: z.enum(["queued", "running", "completed", "needs_review", "failed", "canceled", "timed_out"]),
  replayed: z.boolean(),
  data: z.record(z.string(), z.unknown()),
  timestamp: z.string().datetime(),
};

function resultContent(result: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
    ...(isError ? { isError: true } : {}),
  };
}

function minimizedAuditOutput(data: Record<string, unknown>, mutation: boolean) {
  if (mutation) return data;
  const items = Array.isArray(data.items) ? data.items.length : undefined;
  const job = data.job && typeof data.job === "object" ? data.job as Record<string, unknown> : null;
  return {
    returnedItemCount: items,
    nextCursorPresent: Boolean(data.nextCursor),
    recordPresent: Boolean(data.business ?? data.customer ?? data.job),
    polledStatus: typeof job?.status === "string" ? job.status : undefined,
  };
}

function actionForTool(toolName: string) {
  return ({
    get_business_summary: "getBusinessSummary",
    list_customers: "listCustomers",
    get_customer: "getCustomerHistory",
    list_jobs: "listJobs",
    list_invoices: "listInvoices",
    list_tasks: "getOpenCommitments",
    create_task: "createCommitment",
    update_task: "updateCommitment",
    start_workflow: "startWorkflow",
  } as const)[toolName as keyof ReturnType<typeof actionMap>];
}

function actionMap() {
  return {
    get_business_summary: "getBusinessSummary",
    list_customers: "listCustomers",
    get_customer: "getCustomerHistory",
    list_jobs: "listJobs",
    list_invoices: "listInvoices",
    list_tasks: "getOpenCommitments",
    create_task: "createCommitment",
    update_task: "updateCommitment",
    start_workflow: "startWorkflow",
  } as const;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs = 42_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Tool execution exceeded the synchronous time limit.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runTool(input: {
  credential: AuthenticatedExternalAiCredential;
  toolName: string;
  arguments: Record<string, unknown>;
  mutation: boolean;
}) {
  const idempotency = typeof input.arguments.idempotencyKey === "string" ? input.arguments.idempotencyKey : null;
  if (input.mutation && !idempotency) {
    return resultContent({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Controlled mutations require an idempotencyKey." }, true);
  }
  const invocation = await beginExternalToolInvocation({
    credential: input.credential,
    toolName: input.toolName,
    idempotencyKey: idempotency,
    arguments: input.arguments,
  });
  if (!invocation.execute) {
    return resultContent({
      jobId: invocation.id,
      status: invocation.status,
      replayed: true,
      data: invocation.output_summary_json ?? {},
      timestamp: new Date().toISOString(),
    });
  }
  const sanitized = { ...input.arguments };
  delete sanitized.idempotencyKey;
  try {
    let data: Record<string, unknown>;
    let status: "completed" | "needs_review" = "completed";
    let responseStatus: "queued" | "running" | "completed" | "needs_review" | "failed" | "canceled" | "timed_out" = "completed";
    let referenceType: string | null = null;
    let referenceId: string | null = null;
    if (input.toolName === "get_job_status") {
      const job = await getExternalToolInvocation({ credential: input.credential, invocationId: String(sanitized.jobId) });
      if (!job) throw new Error("The durable job was not found for this credential.");
      data = { job };
      responseStatus = String((job as { status?: string }).status ?? "completed") as typeof responseStatus;
    } else {
      const action = actionForTool(input.toolName);
      if (!action) throw new Error("Unknown tool.");
      const result = await withTimeout(invokeBusinessAction(input.credential.principal, {
        action,
        input: sanitized,
        idempotencyKey: idempotency ?? `mcp-read:${invocation.id}`,
        source: `mcp:${input.credential.providerKey}:${input.credential.credentialId}`,
      }));
      if (!result.ok) throw new Error(result.message);
      data = result.data as Record<string, unknown>;
      status = result.status === "needs_review" ? "needs_review" : "completed";
      responseStatus = status;
      referenceId = typeof data.goalId === "string" ? data.goalId : typeof data.commitmentId === "string" ? data.commitmentId : null;
      referenceType = typeof data.goalId === "string" ? "operating_goal" : typeof data.commitmentId === "string" ? "operating_commitment" : null;
    }
    data = sanitizeExternalToolOutput(data);
    await finishExternalToolInvocation({ tenantId: input.credential.tenantId, invocationId: invocation.id, status,
      output: minimizedAuditOutput(data, input.mutation), durableReferenceType: referenceType, durableReferenceId: referenceId,
      returnedRecordCount: countReturnedRecords(data) });
    const responseJobId = input.toolName === "get_job_status" ? String(sanitized.jobId) : invocation.id;
    return resultContent({ jobId: responseJobId, status: responseStatus, replayed: false, data, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = sanitizeExternalText(error instanceof Error ? error.message : "Tool execution failed.");
    const timedOut = message.includes("time limit");
    await finishExternalToolInvocation({ tenantId: input.credential.tenantId, invocationId: invocation.id,
      status: timedOut ? "timed_out" : "failed", error: message });
    return resultContent({ jobId: invocation.id, status: timedOut ? "timed_out" : "failed", replayed: false,
      data: { message }, timestamp: new Date().toISOString() }, true);
  }
}

export function buildFerocityMcpServer(credential: AuthenticatedExternalAiCredential) {
  const server = new McpServer({ name: "ferocity-business-operating-system", version: "1.0.0" },
    { capabilities: { tools: {} }, maxToolInputElements: 500 });
  const hasScope = (scope: string) => credential.scopes.includes(scope) || credential.scopes.includes("business:*") || credential.scopes.includes("*");
  const register = (name: string, description: string, requiredScope: string, inputSchema: z.ZodRawShape, mutation = false) => {
    if (!hasScope(requiredScope)) return;
    server.registerTool(name, {
      title: name.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "),
      description,
      inputSchema,
      outputSchema: toolOutput,
      annotations: { readOnlyHint: !mutation, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async (args) => runTool({ credential, toolName: name, arguments: args as Record<string, unknown>, mutation }));
  };
  register("get_business_summary", "Get a minimized, timestamped operational summary for the authorized Ferocity workspace.", "business:read", {});
  register("list_customers", "List authorized workspace customers without exposing contact secrets.", "customers:read", listInput);
  register("get_customer", "Get minimized customer history by stable Ferocity customer identifier.", "customers:read", { customerId: uuid });
  register("list_jobs", "List authorized workspace jobs with customer, schedule, and current status.", "jobs:read", listInput);
  register("list_invoices", "List invoice totals, paid amounts, balances, due dates, and status without payment credentials.", "invoices:read", listInput);
  register("list_tasks", "List durable Ferocity commitments requiring follow-through.", "commitments:read", listInput);
  register("get_job_status", "Poll one durable MCP invocation by the job identifier returned from a prior tool call.", "workflows:read", { jobId: uuid });
  register("create_task", "Create a reversible internal Ferocity commitment. This does not message customers or spend money.", "commitments:write", {
    idempotencyKey, description: z.string().trim().min(1).max(2_000),
    responsibleType: z.enum(["user", "employee", "vendor", "customer", "ai", "ferocity"]),
    responsibleLabel: z.string().trim().min(1).max(180), dueAt: z.string().datetime(),
    expectedOutcome: z.string().trim().max(1_000).nullable().optional(),
    importance: z.enum(["low", "normal", "high", "critical"]).default("normal"),
    relatedEntityType: z.string().trim().max(100).nullable().optional(), relatedEntityId: uuid.nullable().optional(),
    completionEvidenceRequired: z.boolean().default(false),
  }, true);
  register("update_task", "Update a reversible internal task. Completion requires evidence; sensitive external actions remain approval-gated.", "commitments:write", {
    idempotencyKey, taskId: uuid, description: z.string().trim().min(1).max(2_000).optional(),
    dueAt: z.string().datetime().nullable().optional(), importance: z.enum(["low", "normal", "high", "critical"]).optional(),
    responsibleLabel: z.string().trim().min(1).max(180).optional(),
    status: z.enum(["active", "completed", "canceled", "blocked"]).optional(), evidence: z.string().trim().min(1).max(2_000).optional(),
  }, true);
  register("start_workflow", "Start or resume a durable Ferocity operating goal in observe or prepare mode. Ferocity approval policies still govern consequential work.", "workflows:write", {
    idempotencyKey, workflowKey: z.string().trim().min(1).max(180), workflowType: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(240), desiredOutcome: z.string().trim().min(1).max(2_000),
    priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
    authorityMode: z.enum(["observe", "prepare"]).default("prepare"), targetAt: z.string().datetime().nullable().optional(),
    relatedEntityType: z.string().trim().max(100).nullable().optional(), relatedEntityId: uuid.nullable().optional(),
  }, true);
  return server;
}

function jsonRpcError(status: number, code: number, message: string) {
  return Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status, headers: { "Cache-Control": "no-store" } });
}

function allowedMcpHosts() {
  const configured = typeof Netlify !== "undefined" ? Netlify.env.get("MCP_ALLOWED_HOSTS") : process.env.MCP_ALLOWED_HOSTS;
  const hosts = (configured ?? "api.ferocity.live,ferocity.live").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (process.env.NODE_ENV !== "production") hosts.push("localhost", "127.0.0.1");
  return new Set(hosts);
}

export async function handleFerocityMcpRequest(request: Request) {
  if (request.method !== "POST") return jsonRpcError(405, -32000, "Method not allowed. Use MCP Streamable HTTP POST.");
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (!allowedMcpHosts().has(hostname)) return jsonRpcError(421, -32002, "The MCP request host is not allowed.");
  const credential = await authenticateExternalAiBearer({ authorizationHeader: request.headers.get("authorization"), userAgent: request.headers.get("user-agent") });
  if (!credential) return jsonRpcError(401, -32001, "Invalid, expired, or revoked integration credential.");
  const server = buildFerocityMcpServer(credential);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 256 * 1024 });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return jsonRpcError(500, -32603, "Internal MCP server error.");
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

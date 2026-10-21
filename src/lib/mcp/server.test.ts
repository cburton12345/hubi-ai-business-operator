import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  begin: vi.fn(),
  finish: vi.fn(),
  getInvocation: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/lib/mcp/credentials", () => ({ authenticateExternalAiBearer: mocks.authenticate }));
vi.mock("@/lib/mcp/invocations", () => ({
  beginExternalToolInvocation: mocks.begin,
  finishExternalToolInvocation: mocks.finish,
  getExternalToolInvocation: mocks.getInvocation,
}));
vi.mock("@/lib/business-actions/gateway", () => ({ invokeBusinessAction: mocks.invoke }));

import { handleFerocityMcpRequest } from "@/lib/mcp/server";

const credential = {
  credentialId: "10000000-0000-4000-8000-000000000001",
  tenantId: "20000000-0000-4000-8000-000000000002",
  userId: "30000000-0000-4000-8000-000000000003",
  providerKey: "muse",
  label: "Muse test",
  scopes: ["business:read", "customers:read", "jobs:read", "invoices:read", "commitments:read", "commitments:write", "workflows:read", "workflows:write"],
  dailyRequestLimit: 500,
  dailyRecordLimit: 2500,
  principal: {
    principalId: "external:10000000-0000-4000-8000-000000000001",
    principalType: "external_agent" as const,
    tenantId: "20000000-0000-4000-8000-000000000002",
    userId: "30000000-0000-4000-8000-000000000003",
    providerKey: "muse",
    scopes: ["business:read", "customers:read", "jobs:read", "invoices:read", "commitments:read", "commitments:write", "workflows:read", "workflows:write"],
    authorization: { verified: true as const, source: "stored_agent_grant" as const, grantId: "10000000-0000-4000-8000-000000000001" },
  },
};

function request(body: unknown, protocolVersion?: string, token = "test-token") {
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
  });
  if (protocolVersion) headers.set("MCP-Protocol-Version", protocolVersion);
  return new Request("https://api.ferocity.live/mcp", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("Ferocity MCP Streamable HTTP endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue(credential);
    mocks.begin.mockResolvedValue({
      id: "40000000-0000-4000-8000-000000000004", status: "running", output_summary_json: {}, replayed: false, execute: true,
    });
    mocks.finish.mockResolvedValue(undefined);
    mocks.invoke.mockResolvedValue({ ok: true, status: "completed", data: { business: { id: credential.tenantId, name: "Test" } } });
  });

  for (const version of ["2025-11-25", "2025-06-18", "2025-03-26"]) {
    it(`negotiates protocol ${version}`, async () => {
      const response = await handleFerocityMcpRequest(request({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: version, capabilities: {}, clientInfo: { name: "muse-test", version: "1.0.0" } },
      }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ jsonrpc: "2.0", id: 1, result: { protocolVersion: version } });
    });
  }

  it("accepts the initialized notification", async () => {
    const response = await handleFerocityMcpRequest(request({ jsonrpc: "2.0", method: "notifications/initialized" }, "2025-11-25"));
    expect([200, 202, 204]).toContain(response.status);
  });

  it("lists the ten scoped tools with schemas", async () => {
    const response = await handleFerocityMcpRequest(request({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, "2025-11-25"));
    const body = await response.json() as { result: { tools: Array<{ name: string; inputSchema: unknown }> } };
    expect(body.result.tools).toHaveLength(10);
    expect(body.result.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "get_business_summary", "list_customers", "get_customer", "list_jobs", "list_invoices",
      "list_tasks", "get_job_status", "create_task", "update_task", "start_workflow",
    ]));
    expect(body.result.tools.every((tool) => Boolean(tool.inputSchema))).toBe(true);
  });

  it("performs a harmless read-only connection test through the business-action gateway", async () => {
    const response = await handleFerocityMcpRequest(request({
      jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_business_summary", arguments: {} },
    }, "2025-11-25"));
    const body = await response.json() as { result: { structuredContent: { status: string; data: unknown } } };
    expect(body.result.structuredContent.status).toBe("completed");
    expect(mocks.invoke).toHaveBeenCalledWith(expect.objectContaining({ tenantId: credential.tenantId }), expect.objectContaining({ action: "getBusinessSummary" }));
  });

  it("redacts secrets and proprietary internals from every tool result", async () => {
    mocks.invoke.mockResolvedValue({ ok: true, status: "completed", data: {
      business: { id: credential.tenantId, name: "Test", accessToken: "never-return-this" },
      systemPrompt: "private orchestration",
      note: `Bearer ${"a".repeat(40)}`,
    } });
    const response = await handleFerocityMcpRequest(request({
      jsonrpc: "2.0", id: 31, method: "tools/call", params: { name: "get_business_summary", arguments: {} },
    }, "2025-11-25"));
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("never-return-this");
    expect(serialized).not.toContain("private orchestration");
  });

  it("rejects missing and invalid bearer tokens before protocol handling", async () => {
    mocks.authenticate.mockResolvedValue(null);
    const response = await handleFerocityMcpRequest(request({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, "2025-11-25", "revoked"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: -32001 } });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("hides tools outside the stored credential scopes", async () => {
    mocks.authenticate.mockResolvedValue({ ...credential, scopes: ["business:read"], principal: { ...credential.principal, scopes: ["business:read"] } });
    const response = await handleFerocityMcpRequest(request({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, "2025-11-25"));
    const body = await response.json() as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((tool) => tool.name)).toEqual(["get_business_summary"]);
  });

  it("ignores caller-supplied tenant identifiers and keeps the stored organization principal", async () => {
    await handleFerocityMcpRequest(request({ jsonrpc: "2.0", id: 7, method: "tools/call", params: {
      name: "list_customers", arguments: { limit: 5, tenantId: "99999999-9999-4999-8999-999999999999" },
    } }, "2025-11-25"));
    expect(mocks.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: credential.tenantId }),
      expect.objectContaining({ input: { limit: 5 } }),
    );
  });

  it("requires idempotency keys and replays a prior mutation", async () => {
    const missing = await handleFerocityMcpRequest(request({ jsonrpc: "2.0", id: 4, method: "tools/call", params: {
      name: "create_task", arguments: { description: "Test", responsibleType: "ferocity", responsibleLabel: "Ferocity", dueAt: "2026-10-15T00:00:00.000Z" },
    } }, "2025-11-25"));
    expect(JSON.stringify(await missing.json())).toContain("idempotencyKey");
    mocks.begin.mockResolvedValue({ id: "40000000-0000-4000-8000-000000000004", status: "completed",
      output_summary_json: { commitmentId: "50000000-0000-4000-8000-000000000005" }, replayed: true, execute: false });
    const replay = await handleFerocityMcpRequest(request({ jsonrpc: "2.0", id: 5, method: "tools/call", params: {
      name: "create_task", arguments: { idempotencyKey: "stable-key-001", description: "Test", responsibleType: "ferocity", responsibleLabel: "Ferocity", dueAt: "2026-10-15T00:00:00.000Z" },
    } }, "2025-11-25"));
    const replayBody = await replay.json() as { result: { structuredContent: { replayed: boolean } } };
    expect(replayBody.result.structuredContent.replayed).toBe(true);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("returns protocol errors for malformed requests and unsupported methods", async () => {
    const malformed = await handleFerocityMcpRequest(request({ jsonrpc: "2.0", id: 9, method: "unknown/method" }, "2025-11-25"));
    expect(JSON.stringify(await malformed.json())).toContain("error");
    const get = await handleFerocityMcpRequest(new Request("https://api.ferocity.live/mcp", { method: "GET" }));
    expect(get.status).toBe(405);
  });

  it("ends synchronous tool work before 45 seconds and records a durable timeout", async () => {
    vi.useFakeTimers();
    try {
      mocks.invoke.mockImplementation(() => new Promise(() => undefined));
      const pending = handleFerocityMcpRequest(request({
        jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "get_business_summary", arguments: {} },
      }, "2025-11-25"));
      await vi.advanceTimersByTimeAsync(42_001);
      const response = await pending;
      expect(JSON.stringify(await response.json())).toContain("timed_out");
      expect(mocks.finish).toHaveBeenCalledWith(expect.objectContaining({ status: "timed_out" }));
    } finally {
      vi.useRealTimers();
    }
  });
});

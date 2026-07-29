import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import { generateJsonWithAiService } from "@/lib/ai/ai-service";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import { sendWorkspacePushNotifications } from "@/lib/push/send-workspace-push";
import { connectorCanBeMarkedReady } from "@/lib/integrations/connector-runtime";

type AdapterBuildRow = {
  id: string;
  tenant_id: string;
  request_id: string;
  provider_key: string;
  provider_name: string;
  capability_category: string;
  documentation_url: string | null;
  status: string;
};

type NormalizedOperation = {
  operationId: string;
  method: string;
  path: string;
  securitySchemes: string[];
  writeCapable: boolean;
};

type AdapterManifest = {
  providerKey: string;
  displayName: string;
  capabilityCategory: string;
  baseOrigin: string;
  authentication: {
    supportedTypes: string[];
    credentialLabels: string[];
  };
  operations: NormalizedOperation[];
  requestedOperationIds: string[];
  writesDisabledByDefault: boolean;
  generatedFrom: "normalized_openapi";
};

type CheckResult = {
  key: string;
  passed: boolean;
  severity: "info" | "warning" | "blocking";
  detail: string;
};

const highRiskCategories = new Set(["advertising", "email", "payments", "sms", "video", "voice"]);

function normalizeProviderKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "requested_provider";
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  return (
    parts[0] === 0
    || parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] >= 224
  );
}

function isPrivateAddress(address: string) {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }
  return true;
}

export async function validateAdapterDocumentationUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false as const, reason: "A valid official HTTPS OpenAPI URL is required." };
  }
  if (
    url.protocol !== "https:"
    || url.port
    || url.username
    || url.password
    || url.hostname === "localhost"
    || url.hostname.endsWith(".local")
  ) {
    return { ok: false as const, reason: "Documentation must use a public HTTPS URL with no embedded credentials or custom port." };
  }
  try {
    const addresses = await dns.lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
      return { ok: false as const, reason: "Documentation host resolved to a private or restricted network." };
    }
    return { ok: true as const, url, addresses };
  } catch {
    return { ok: false as const, reason: "Documentation host could not be verified." };
  }
}

async function fetchOfficialOpenApi(rawUrl: string) {
  const validated = await validateAdapterDocumentationUrl(rawUrl);
  if (!validated.ok) return { ok: false as const, reason: validated.reason };

  const response = await new Promise<{
    statusCode: number;
    contentType: string;
    contentLength: number;
    text: string;
  }>((resolve, reject) => {
    const pinned = validated.addresses[0];
    const request = https.request({
      protocol: "https:",
      hostname: validated.url.hostname,
      port: 443,
      path: `${validated.url.pathname}${validated.url.search}`,
      method: "GET",
      servername: validated.url.hostname,
      headers: {
        accept: "application/json, application/vnd.oai.openapi+json",
        "user-agent": "Ferocity-Adapter-Factory/1.0"
      },
      lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family)
    }, (incoming) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      incoming.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1_000_000) {
          request.destroy(new Error("OpenAPI document exceeds the 1 MB safety limit."));
          return;
        }
        chunks.push(chunk);
      });
      incoming.on("end", () => resolve({
        statusCode: incoming.statusCode ?? 0,
        contentType: String(incoming.headers["content-type"] ?? "").toLowerCase(),
        contentLength: Number(incoming.headers["content-length"] ?? 0),
        text: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.setTimeout(10_000, () => request.destroy(new Error("Official specification request timed out.")));
    request.on("error", reject);
    request.end();
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    return { ok: false as const, reason: `Official specification returned HTTP ${response.statusCode}.` };
  }
  if (!response.contentType.includes("json")) {
    return { ok: false as const, reason: "Provide a direct JSON OpenAPI document, not a documentation webpage." };
  }
  if (response.contentLength > 1_000_000) return { ok: false as const, reason: "OpenAPI document exceeds the 1 MB safety limit." };
  try {
    const document = JSON.parse(response.text) as Record<string, unknown>;
    if (typeof document.openapi !== "string" || !document.openapi.startsWith("3.")) {
      return { ok: false as const, reason: "Only OpenAPI 3.x JSON documents are accepted." };
    }
    return { ok: true as const, document, origin: validated.url.origin, documentationUrl: validated.url.toString() };
  } catch {
    return { ok: false as const, reason: "OpenAPI document is not valid JSON." };
  }
}

export function normalizeOpenApiForAdapter(document: Record<string, unknown>) {
  const components = document.components && typeof document.components === "object"
    ? document.components as Record<string, unknown>
    : {};
  const schemesRecord = components.securitySchemes && typeof components.securitySchemes === "object"
    ? components.securitySchemes as Record<string, unknown>
    : {};
  const supportedTypes = [...new Set(Object.values(schemesRecord).map((value) => {
    if (!value || typeof value !== "object") return "unknown";
    const scheme = value as Record<string, unknown>;
    if (scheme.type === "http" && scheme.scheme === "bearer") return "bearer";
    if (scheme.type === "apiKey") return "api_key";
    if (scheme.type === "oauth2") return "oauth2";
    return String(scheme.type ?? "unknown").slice(0, 40);
  }))];
  const schemeNames = Object.keys(schemesRecord).slice(0, 20);
  const paths = document.paths && typeof document.paths === "object"
    ? document.paths as Record<string, unknown>
    : {};
  const operations: NormalizedOperation[] = [];
  const methods = new Set(["get", "post", "put", "patch", "delete"]);
  for (const [path, rawPath] of Object.entries(paths).slice(0, 250)) {
    if (!path.startsWith("/") || !rawPath || typeof rawPath !== "object") continue;
    for (const [method, rawOperation] of Object.entries(rawPath as Record<string, unknown>)) {
      if (!methods.has(method) || !rawOperation || typeof rawOperation !== "object") continue;
      const operation = rawOperation as Record<string, unknown>;
      operations.push({
        operationId: typeof operation.operationId === "string"
          ? operation.operationId.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120)
          : `${method}_${path}`.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120),
        method: method.toUpperCase(),
        path: path.slice(0, 300),
        securitySchemes: schemeNames,
        writeCapable: method !== "get"
      });
    }
  }
  return { operations: operations.slice(0, 150), supportedTypes, schemeNames };
}

export function runAdapterAutomatedChecks(input: {
  origin: string;
  operations: NormalizedOperation[];
  supportedTypes: string[];
  category: string;
}): CheckResult[] {
  const hasWrites = input.operations.some((operation) => operation.writeCapable);
  const supportedAuth = input.supportedTypes.some((type) => ["api_key", "bearer", "oauth2"].includes(type));
  return [
    { key: "public_https_origin", passed: input.origin.startsWith("https://"), severity: "blocking", detail: "Adapter egress is pinned to one verified public HTTPS origin." },
    { key: "operations_present", passed: input.operations.length > 0, severity: "blocking", detail: `${input.operations.length} normalized operation(s) found.` },
    { key: "supported_authentication", passed: supportedAuth, severity: "blocking", detail: supportedAuth ? "A supported credential pattern is declared." : "No supported API-key, bearer, or OAuth2 scheme was found." },
    { key: "writes_default_off", passed: true, severity: "blocking", detail: hasWrites ? "Write operations exist but remain disabled pending provider-specific implementation and approval." : "Specification is read-only." },
    { key: "high_risk_review", passed: !highRiskCategories.has(input.category), severity: "warning", detail: highRiskCategories.has(input.category) ? "High-risk category requires operator and engineering review." : "Category is not automatically high risk." },
    { key: "no_runtime_code", passed: true, severity: "blocking", detail: "Factory produced data-only artifacts; no generated code can execute." },
    { key: "no_credentials_ingested", passed: true, severity: "blocking", detail: "Research accepted no customer secrets or tokens." }
  ];
}

async function recordBuildEvent(input: {
  tenantId: string;
  buildId: string;
  eventType: string;
  actorType: "customer" | "ai" | "operator" | "system";
  fromStatus?: string | null;
  toStatus?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  await queryPostgres(
    `
    insert into public.provider_adapter_build_events (
      tenant_id, build_id, event_type, actor_type, from_status, to_status, summary, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    `,
    [
      input.tenantId,
      input.buildId,
      input.eventType,
      input.actorType,
      input.fromStatus ?? null,
      input.toStatus ?? null,
      input.summary,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

export async function queueAdapterFactoryBuild(input: {
  tenantId: string;
  requestId: string;
  providerName: string;
  capabilityCategory: string;
  documentationUrl?: string | null;
}) {
  const gate = await getServiceGate(input.tenantId, "adapter_factory");
  if (!gate.enabled) {
    await queryPostgres(
      `
      insert into public.operator_timeline_events (
        tenant_id, event_family, event_type, title, body, visibility, metadata_json
      )
      values ($1, 'system', 'adapter_factory_blocked', 'Provider request saved', $2, 'internal', $3::jsonb)
      `,
      [
        input.tenantId,
        `The ${input.providerName} request was saved, but automated adapter research did not start: ${gate.reason}`,
        JSON.stringify({
          providerName: input.providerName,
          featureKey: gate.featureKey,
          currentUsage: gate.currentUsage,
          usageLimit: gate.usageLimit
        })
      ]
    );
    return null;
  }
  const providerKey = normalizeProviderKey(input.providerName);
  const result = await queryPostgres<{ id: string; status: string }>(
    `
    insert into public.provider_adapter_builds (
      tenant_id, request_id, provider_key, provider_name, capability_category,
      documentation_url, status, metadata_json
    )
    values ($1,$2,$3,$4,$5,nullif($6,''),'queued',
      '{"arbitraryCodeExecution":false,"productionAutoDeploy":false,"credentialsAcceptedDuringResearch":false}'::jsonb)
    on conflict (request_id) do update
    set documentation_url = coalesce(excluded.documentation_url, public.provider_adapter_builds.documentation_url),
        status = case
          when public.provider_adapter_builds.status in ('needs_information','changes_requested','failed','rejected') then 'queued'
          else public.provider_adapter_builds.status
        end,
        updated_at = now()
    returning id, status
    `,
    [
      input.tenantId,
      input.requestId,
      providerKey,
      input.providerName,
      input.capabilityCategory,
      input.documentationUrl ?? ""
    ]
  );
  const build = result?.rows[0];
  if (build) {
    await recordBuildEvent({
      tenantId: input.tenantId,
      buildId: build.id,
      eventType: "adapter_build_queued",
      actorType: "customer",
      toStatus: build.status,
      summary: `${input.providerName} adapter request entered the guarded factory.`
    });
  }
  return build ?? null;
}

export async function processAdapterFactoryQueueForTenant(tenantId: string, limit = 2) {
  const result = await queryPostgres<AdapterBuildRow>(
    `
    select id, tenant_id, request_id, provider_key, provider_name, capability_category,
           documentation_url, status
    from public.provider_adapter_builds
    where tenant_id = $1 and status = 'queued'
    order by requested_at asc
    limit $2
    `,
    [tenantId, limit]
  );
  const builds = result?.rows ?? [];
  const outcomes: Array<{ buildId: string; status: string; reason?: string }> = [];

  for (const build of builds) {
    const claimed = await queryPostgres<{ id: string }>(
      `
      update public.provider_adapter_builds
      set status = 'researching', research_started_at = now(), last_error = null, updated_at = now()
      where tenant_id = $1 and id = $2 and status = 'queued'
      returning id
      `,
      [tenantId, build.id]
    );
    if (!claimed?.rows[0]) continue;
    if (!build.documentation_url) {
      const reason = "Add a direct official OpenAPI 3.x JSON URL so Ferocity can build a safe draft.";
      await queryPostgres(
        `
        update public.provider_adapter_builds
        set status = 'needs_information', last_error = $3, updated_at = now()
        where tenant_id = $1 and id = $2
        `,
        [tenantId, build.id, reason]
      );
      await queryPostgres(
        "update public.provider_integration_requests set status = 'researching', updated_at = now() where tenant_id = $1 and id = $2",
        [tenantId, build.request_id]
      );
      await recordBuildEvent({
        tenantId,
        buildId: build.id,
        eventType: "adapter_information_required",
        actorType: "system",
        fromStatus: "researching",
        toStatus: "needs_information",
        summary: reason
      });
      outcomes.push({ buildId: build.id, status: "needs_information", reason });
      continue;
    }

    try {
      const specification = await fetchOfficialOpenApi(build.documentation_url);
      if (!specification.ok) {
        await queryPostgres(
          `
          update public.provider_adapter_builds
          set status = 'needs_information', last_error = $3, updated_at = now()
          where tenant_id = $1 and id = $2
          `,
          [tenantId, build.id, specification.reason]
        );
        await recordBuildEvent({
          tenantId,
          buildId: build.id,
          eventType: "adapter_spec_rejected",
          actorType: "system",
          fromStatus: "researching",
          toStatus: "needs_information",
          summary: specification.reason
        });
        outcomes.push({ buildId: build.id, status: "needs_information", reason: specification.reason });
        continue;
      }

      const normalized = normalizeOpenApiForAdapter(specification.document);
      const checks = runAdapterAutomatedChecks({
        origin: specification.origin,
        operations: normalized.operations,
        supportedTypes: normalized.supportedTypes,
        category: build.capability_category
      });
      const blockingFailure = checks.some((check) => check.severity === "blocking" && !check.passed);
      const fallback: AdapterManifest = {
        providerKey: build.provider_key,
        displayName: build.provider_name,
        capabilityCategory: build.capability_category,
        baseOrigin: specification.origin,
        authentication: {
          supportedTypes: normalized.supportedTypes,
          credentialLabels: normalized.schemeNames
        },
        operations: normalized.operations,
        requestedOperationIds: normalized.operations.filter((operation) => !operation.writeCapable).slice(0, 10).map((operation) => operation.operationId),
        writesDisabledByDefault: true,
        generatedFrom: "normalized_openapi"
      };
      const manifest = await generateJsonWithAiService<AdapterManifest>({
        tenantId,
        featureKey: "adapter_factory",
        runType: "adapter_factory_manifest",
        system: "Select only the minimum normalized operations needed for a provider adapter. Never enable writes. Never invent endpoints, credentials, URLs, or capabilities. Return the same manifest shape as the fallback.",
        user: JSON.stringify({
          requestedCategory: build.capability_category,
          providerName: build.provider_name,
          permittedOperationIds: normalized.operations.map((operation) => operation.operationId),
          fallback
        }),
        fallback,
        temperature: 0,
        metadata: { buildId: build.id, normalizedOpenApiOnly: true, documentationContentExcluded: true }
      });
      const permittedIds = new Set(normalized.operations.map((operation) => operation.operationId));
      manifest.requestedOperationIds = (Array.isArray(manifest.requestedOperationIds) ? manifest.requestedOperationIds : [])
        .filter((operationId): operationId is string => typeof operationId === "string")
        .filter((operationId) => permittedIds.has(operationId))
        .slice(0, 25);
      manifest.providerKey = fallback.providerKey;
      manifest.displayName = fallback.displayName;
      manifest.capabilityCategory = fallback.capabilityCategory;
      manifest.operations = normalized.operations;
      manifest.baseOrigin = specification.origin;
      manifest.authentication = fallback.authentication;
      manifest.writesDisabledByDefault = true;
      manifest.generatedFrom = "normalized_openapi";

      const status = blockingFailure ? "needs_information" : "approval_required";
      await queryPostgres(
        `
        update public.provider_adapter_builds
        set documentation_url = $3,
            documentation_origin = $4,
            status = $5,
            risk_level = $6,
            manifest_json = $7::jsonb,
            generated_artifact_json = $8::jsonb,
            automated_checks_json = $9::jsonb,
            last_error = $10,
            draft_completed_at = now(),
            updated_at = now()
        where tenant_id = $1 and id = $2
        `,
        [
          tenantId,
          build.id,
          specification.documentationUrl,
          specification.origin,
          status,
          highRiskCategories.has(build.capability_category) || normalized.operations.some((operation) => operation.writeCapable) ? "high" : "medium",
          JSON.stringify(manifest),
          JSON.stringify({
            artifactType: "declarative_adapter_draft",
            executable: false,
            productionAutoDeploy: false,
            allowedOrigin: specification.origin,
            requestedOperationIds: manifest.requestedOperationIds
          }),
          JSON.stringify(checks),
          blockingFailure ? "One or more blocking automated checks failed." : null
        ]
      );
      await queryPostgres(
        "update public.provider_integration_requests set status = $3, updated_at = now() where tenant_id = $1 and id = $2",
        [tenantId, build.request_id, blockingFailure ? "researching" : "building"]
      );
      await recordBuildEvent({
        tenantId,
        buildId: build.id,
        eventType: "adapter_draft_completed",
        actorType: "ai",
        fromStatus: "researching",
        toStatus: status,
        summary: blockingFailure
          ? "Adapter draft requires corrected documentation or authentication details."
          : "A data-only adapter draft passed automated checks and is ready for review.",
        metadata: { checkCount: checks.length, requestedOperationCount: manifest.requestedOperationIds.length }
      });
      await queryPostgres(
        `
        insert into public.operator_timeline_events (
          tenant_id, event_family, event_type, title, body, visibility,
          primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
        )
        values ($1, 'system', 'adapter_factory_review_ready', $2, $3, 'internal',
          'provider_adapter_build', $4, 'provider_adapter_builds', $4, $5::jsonb)
        `,
        [
          tenantId,
          `${build.provider_name} adapter draft is ready`,
          "Ferocity normalized the official OpenAPI document and completed automated safety checks. Production release still requires review and engineering validation.",
          build.id,
          JSON.stringify({ status, href: "/app/integrations", arbitraryCodeExecuted: false })
        ]
      );
      if (!blockingFailure) {
        await sendWorkspacePushNotifications({
          tenantId,
          eventType: "adapter_factory_review_ready",
          title: `${build.provider_name} connection draft is ready`,
          body: "Safety checks passed. Review the draft before it can move to engineering.",
          url: "/app/integrations",
          tag: `adapter-factory-${build.id}`,
          metadata: { buildId: build.id, productionReleased: false }
        });
      }
      outcomes.push({ buildId: build.id, status });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Adapter research failed.";
      await queryPostgres(
        `
        update public.provider_adapter_builds
        set status = 'failed', last_error = $3, updated_at = now()
        where tenant_id = $1 and id = $2
        `,
        [tenantId, build.id, reason.slice(0, 1000)]
      );
      await recordBuildEvent({
        tenantId,
        buildId: build.id,
        eventType: "adapter_build_failed",
        actorType: "system",
        fromStatus: "researching",
        toStatus: "failed",
        summary: "Adapter research failed safely without executing generated code.",
        metadata: { reason: reason.slice(0, 500) }
      });
      outcomes.push({ buildId: build.id, status: "failed", reason });
    }
  }
  return { checked: builds.length, outcomes };
}

export async function reviewAdapterBuild(input: {
  tenantId: string;
  buildId: string;
  userId: string | null;
  decision: "approved_for_engineering" | "changes_requested" | "rejected";
  notes?: string;
}) {
  const current = await queryPostgres<{ status: string; request_id: string; provider_name: string }>(
    `
    select status, request_id, provider_name
    from public.provider_adapter_builds
    where tenant_id = $1 and id = $2
    limit 1
    `,
    [input.tenantId, input.buildId]
  );
  const build = current?.rows[0];
  if (!build || build.status !== "approval_required") return false;
  await queryPostgres(
    `
    update public.provider_adapter_builds
    set status = $3, reviewed_by_user_id = $4, reviewed_at = now(),
        metadata_json = metadata_json || $5::jsonb, updated_at = now()
    where tenant_id = $1 and id = $2 and status = 'approval_required'
    `,
    [
      input.tenantId,
      input.buildId,
      input.decision,
      input.userId,
      JSON.stringify({ reviewNotes: input.notes?.slice(0, 1000) ?? "", productionReleased: false })
    ]
  );
  await queryPostgres(
    "update public.provider_integration_requests set status = $3, updated_at = now() where tenant_id = $1 and id = $2",
    [
      input.tenantId,
      build.request_id,
      input.decision === "approved_for_engineering" ? "building" : input.decision === "rejected" ? "declined" : "researching"
    ]
  );
  await recordBuildEvent({
    tenantId: input.tenantId,
    buildId: input.buildId,
    eventType: "adapter_build_reviewed",
    actorType: "operator",
    fromStatus: build.status,
    toStatus: input.decision,
    summary: `${build.provider_name} adapter draft was ${input.decision.replaceAll("_", " ")}.`,
    metadata: { notes: input.notes?.slice(0, 1000) ?? "" }
  });
  return true;
}

export async function getAdapterBuildsForTenant(tenantId: string) {
  const result = await queryPostgres<{
    id: string;
    provider_name: string;
    capability_category: string;
    status: string;
    risk_level: string;
    documentation_url: string | null;
    last_error: string | null;
    automated_checks_json: CheckResult[];
    updated_at: Date;
  }>(
    `
    select id, provider_name, capability_category, status, risk_level,
           documentation_url, last_error, automated_checks_json, updated_at
    from public.provider_adapter_builds
    where tenant_id = $1
    order by updated_at desc
    limit 20
    `,
    [tenantId]
  );
  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    providerName: row.provider_name,
    category: row.capability_category,
    status: row.status,
    riskLevel: row.risk_level,
    documentationUrl: row.documentation_url,
    lastError: row.last_error,
    checks: row.automated_checks_json ?? [],
    updatedAt: new Date(row.updated_at).toISOString()
  }));
}

export async function markAdapterBuildReleased(input: {
  tenantId: string;
  buildId: string;
  releaseVersion: string;
  deploymentCommitSha: string;
}) {
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(input.releaseVersion)) {
    throw new Error("A valid release version is required.");
  }
  if (!/^[a-f0-9]{7,64}$/i.test(input.deploymentCommitSha)) {
    throw new Error("A valid deployment commit SHA is required.");
  }
  const current = await queryPostgres<{ provider_key: string; status: string }>(
    "select provider_key, status from public.provider_adapter_builds where tenant_id = $1 and id = $2 limit 1",
    [input.tenantId, input.buildId]
  );
  const currentBuild = current?.rows[0];
  if (!currentBuild || currentBuild.status !== "approved_for_engineering") {
    throw new Error("Adapter must be approved for engineering before release.");
  }
  if (!connectorCanBeMarkedReady(currentBuild.provider_key)) {
    throw new Error("The tested provider adapter must be registered as executable before release.");
  }
  const result = await queryPostgres<{
    request_id: string;
    provider_name: string;
    status: string;
  }>(
    `
    update public.provider_adapter_builds
    set status = 'released',
        release_version = $3,
        released_at = now(),
        metadata_json = metadata_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1
      and id = $2
      and status = 'approved_for_engineering'
      and coalesce((generated_artifact_json->>'executable')::boolean, false) = false
      and coalesce((metadata_json->>'productionAutoDeploy')::boolean, false) = false
    returning request_id, provider_name, status
    `,
    [
      input.tenantId,
      input.buildId,
      input.releaseVersion,
      JSON.stringify({
        deploymentCommitSha: input.deploymentCommitSha,
        releasedByTrustedEngineeringPath: true,
        productionReleased: true
      })
    ]
  );
  const build = result?.rows[0];
  if (!build) {
    throw new Error("Adapter must be approved for engineering before a trusted release can be recorded.");
  }
  await queryPostgres(
    "update public.provider_integration_requests set status = 'available', updated_at = now() where tenant_id = $1 and id = $2",
    [input.tenantId, build.request_id]
  );
  await recordBuildEvent({
    tenantId: input.tenantId,
    buildId: input.buildId,
    eventType: "adapter_released",
    actorType: "system",
    fromStatus: "approved_for_engineering",
    toStatus: "released",
    summary: `${build.provider_name} passed the trusted engineering release gate.`,
    metadata: {
      releaseVersion: input.releaseVersion,
      deploymentCommitSha: input.deploymentCommitSha
    }
  });
  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id, event_family, event_type, title, body, visibility,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    values ($1, 'system', 'adapter_factory_released', $2, $3, 'internal',
      'provider_adapter_build', $4, 'provider_adapter_builds', $4, $5::jsonb)
    `,
    [
      input.tenantId,
      `${build.provider_name} connection is available`,
      "The requested provider passed engineering validation and its guarded release was recorded.",
      input.buildId,
      JSON.stringify({
        href: "/app/integrations",
        releaseVersion: input.releaseVersion,
        deploymentCommitSha: input.deploymentCommitSha
      })
    ]
  );
  await sendWorkspacePushNotifications({
    tenantId: input.tenantId,
    eventType: "adapter_factory_released",
    title: `${build.provider_name} is ready`,
    body: "Your requested connection passed engineering validation and is now available.",
    url: "/app/integrations",
    tag: `adapter-released-${input.buildId}`,
    metadata: { buildId: input.buildId, releaseVersion: input.releaseVersion }
  });
  await queryPostgres(
    "update public.provider_adapter_builds set notification_sent_at = now(), updated_at = now() where tenant_id = $1 and id = $2",
    [input.tenantId, input.buildId]
  );
  return true;
}

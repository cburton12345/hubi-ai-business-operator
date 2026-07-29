import { queryPostgres } from "@/lib/db/postgres";

export const savedPreferenceScopeTypes = [
  "organization",
  "department",
  "location",
  "workflow",
  "user",
  "contact",
  "customer",
  "job",
  "project"
] as const;

export type SavedPreferenceScopeType = typeof savedPreferenceScopeTypes[number];

export type SavedPreferenceScope = {
  type: SavedPreferenceScopeType;
  key: string;
};

export type ResolvedSavedPreference<T> = {
  value: T;
  scope: SavedPreferenceScope | null;
  source: "one_time" | "saved" | "fallback";
};

export type PreferenceAuditEventType =
  | "resolved"
  | "created"
  | "changed"
  | "one_time_override"
  | "promoted_to_default"
  | "blocked_by_policy";

function cleanKey(value: string) {
  return value.trim().toLowerCase();
}

export async function resolveSavedPreference<T>(input: {
  tenantId: string;
  domain: string;
  key: string;
  scopes: SavedPreferenceScope[];
  fallback: T;
  oneTimeOverride?: T | null;
  audit?: {
    userId?: string | null;
    context?: Record<string, unknown>;
  };
}): Promise<ResolvedSavedPreference<T>> {
  if (input.oneTimeOverride !== undefined && input.oneTimeOverride !== null) {
    const resolved = { value: input.oneTimeOverride, scope: null, source: "one_time" as const };
    if (input.audit) {
      await recordPreferenceAuditEvent({
        tenantId: input.tenantId,
        domain: input.domain,
        key: input.key,
        eventType: "one_time_override",
        value: input.oneTimeOverride,
        source: "one_time",
        userId: input.audit.userId,
        context: input.audit.context
      });
    }
    return resolved;
  }

  const scopes = input.scopes
    .map((scope, index) => ({
      type: scope.type,
      key: cleanKey(scope.key),
      priority: input.scopes.length - index
    }))
    .filter((scope) => scope.key);

  if (scopes.length === 0) return { value: input.fallback, scope: null, source: "fallback" };

  const result = await queryPostgres<{
    scope_type: SavedPreferenceScopeType;
    scope_key: string;
    value_json: T;
  }>(
    `
    with requested(scope_type, scope_key, priority) as (
      select *
      from unnest($4::text[], $5::text[], $6::int[])
    )
    select p.scope_type, p.scope_key, p.value_json
    from requested r
    join public.scoped_saved_preferences p
      on p.tenant_id = $1
      and p.preference_domain = $2
      and p.preference_key = $3
      and p.scope_type = r.scope_type
      and p.scope_key = r.scope_key
      and p.status = 'active'
    order by r.priority desc, p.updated_at desc
    limit 1
    `,
    [
      input.tenantId,
      cleanKey(input.domain),
      cleanKey(input.key),
      scopes.map((scope) => scope.type),
      scopes.map((scope) => scope.key),
      scopes.map((scope) => scope.priority)
    ]
  );
  const row = result?.rows[0];
  if (!row) return { value: input.fallback, scope: null, source: "fallback" };

  const resolved = {
    value: row.value_json,
    scope: { type: row.scope_type, key: row.scope_key },
    source: "saved" as const
  };
  if (input.audit) {
    await recordPreferenceAuditEvent({
      tenantId: input.tenantId,
      domain: input.domain,
      key: input.key,
      eventType: "resolved",
      scope: resolved.scope,
      value: resolved.value,
      source: "saved",
      userId: input.audit.userId,
      context: input.audit.context
    });
  }
  return resolved;
}

export async function saveScopedPreference<T>(input: {
  tenantId: string;
  domain: string;
  key: string;
  scope: SavedPreferenceScope;
  value: T;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const scopeKey = cleanKey(input.scope.key);
  if (!scopeKey) throw new Error("A preference scope key is required.");

  const previousResult = await queryPostgres<{ value_json: T }>(
    `
    select value_json
    from public.scoped_saved_preferences
    where tenant_id = $1 and preference_domain = $2 and preference_key = $3
      and scope_type = $4 and scope_key = $5
    limit 1
    `,
    [
      input.tenantId,
      cleanKey(input.domain),
      cleanKey(input.key),
      input.scope.type,
      scopeKey
    ]
  );

  await queryPostgres(
    `
    insert into public.scoped_saved_preferences (
      tenant_id, preference_domain, preference_key, scope_type, scope_key,
      value_json, status, source, created_by_user_id, metadata_json, updated_at
    )
    values (
      $1, $2, $3, $4, $5, $6::jsonb, 'active', 'explicit',
      nullif($7::text, '')::uuid, $8::jsonb, now()
    )
    on conflict (
      tenant_id, preference_domain, preference_key, scope_type, scope_key
    ) do update
    set value_json = excluded.value_json,
        status = 'active',
        source = 'explicit',
        created_by_user_id = excluded.created_by_user_id,
        metadata_json = public.scoped_saved_preferences.metadata_json
          || excluded.metadata_json,
        updated_at = now()
    `,
    [
      input.tenantId,
      cleanKey(input.domain),
      cleanKey(input.key),
      input.scope.type,
      scopeKey,
      JSON.stringify(input.value),
      input.userId ?? "",
      JSON.stringify(input.metadata ?? {})
    ]
  );

  await recordPreferenceAuditEvent({
    tenantId: input.tenantId,
    domain: input.domain,
    key: input.key,
    eventType: previousResult?.rows[0] ? "changed" : "created",
    scope: { type: input.scope.type, key: scopeKey },
    previousValue: previousResult?.rows[0]?.value_json,
    value: input.value,
    source: "explicit",
    userId: input.userId,
    context: input.metadata
  });
}

export async function recordPreferenceAuditEvent<T>(input: {
  tenantId: string;
  domain: string;
  key: string;
  eventType: PreferenceAuditEventType;
  scope?: SavedPreferenceScope | null;
  previousValue?: T;
  value: T;
  source?: string | null;
  userId?: string | null;
  context?: Record<string, unknown>;
}) {
  await queryPostgres(
    `
    insert into public.preference_audit_events (
      tenant_id, preference_domain, preference_key, event_type,
      scope_type, scope_key, resolved_source, previous_value_json,
      value_json, actor_user_id, context_json
    )
    values (
      $1, $2, $3, $4, nullif($5, ''), nullif($6, ''), nullif($7, ''),
      $8::jsonb, $9::jsonb, nullif($10::text, '')::uuid, $11::jsonb
    )
    `,
    [
      input.tenantId,
      cleanKey(input.domain),
      cleanKey(input.key),
      input.eventType,
      input.scope?.type ?? "",
      input.scope?.key ?? "",
      input.source ?? "",
      input.previousValue === undefined ? null : JSON.stringify(input.previousValue),
      JSON.stringify(input.value),
      input.userId ?? "",
      JSON.stringify(input.context ?? {})
    ]
  );
}

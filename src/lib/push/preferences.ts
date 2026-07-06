import { queryPostgres } from "@/lib/db/postgres";

export type PushSeverity = "info" | "low" | "medium" | "high" | "critical";
export type PushRiskType = "revenue" | "financial" | "customer" | "legal" | "safety" | "automation" | "low_confidence" | "approval";

export type PushNotificationPreferences = {
  ownerAlertsEnabled: boolean;
  minSeverity: PushSeverity;
  minMoneyCents: number;
  notifyRevenue: boolean;
  notifyFinancial: boolean;
  notifyCustomer: boolean;
  notifyLegal: boolean;
  notifySafety: boolean;
  notifyAutomation: boolean;
  notifyLowConfidence: boolean;
  notifyApproval: boolean;
};

const defaultPreferences: PushNotificationPreferences = {
  ownerAlertsEnabled: true,
  minSeverity: "high",
  minMoneyCents: 10000,
  notifyRevenue: true,
  notifyFinancial: true,
  notifyCustomer: true,
  notifyLegal: true,
  notifySafety: true,
  notifyAutomation: true,
  notifyLowConfidence: true,
  notifyApproval: true
};

const severityRank: Record<PushSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const riskField: Record<PushRiskType, keyof PushNotificationPreferences> = {
  revenue: "notifyRevenue",
  financial: "notifyFinancial",
  customer: "notifyCustomer",
  legal: "notifyLegal",
  safety: "notifySafety",
  automation: "notifyAutomation",
  low_confidence: "notifyLowConfidence",
  approval: "notifyApproval"
};

type PreferenceRow = {
  owner_alerts_enabled: boolean;
  min_severity: PushSeverity;
  min_money_cents: number;
  notify_revenue: boolean;
  notify_financial: boolean;
  notify_customer: boolean;
  notify_legal: boolean;
  notify_safety: boolean;
  notify_automation: boolean;
  notify_low_confidence: boolean;
  notify_approval: boolean;
};

export function getDefaultPushNotificationPreferences() {
  return defaultPreferences;
}

function mapRow(row: PreferenceRow): PushNotificationPreferences {
  return {
    ownerAlertsEnabled: row.owner_alerts_enabled,
    minSeverity: row.min_severity,
    minMoneyCents: Number(row.min_money_cents ?? defaultPreferences.minMoneyCents),
    notifyRevenue: row.notify_revenue,
    notifyFinancial: row.notify_financial,
    notifyCustomer: row.notify_customer,
    notifyLegal: row.notify_legal,
    notifySafety: row.notify_safety,
    notifyAutomation: row.notify_automation,
    notifyLowConfidence: row.notify_low_confidence,
    notifyApproval: row.notify_approval
  };
}

export async function getPushNotificationPreferences(tenantId: string): Promise<PushNotificationPreferences> {
  const result = await queryPostgres<PreferenceRow>(
    `
    select owner_alerts_enabled, min_severity, min_money_cents, notify_revenue, notify_financial,
           notify_customer, notify_legal, notify_safety, notify_automation, notify_low_confidence, notify_approval
    from public.push_notification_preferences
    where tenant_id = $1
    limit 1
    `,
    [tenantId]
  );

  const row = result?.rows[0];
  return row ? mapRow(row) : defaultPreferences;
}

export async function upsertPushNotificationPreferences(tenantId: string, preferences: PushNotificationPreferences) {
  await queryPostgres(
    `
    insert into public.push_notification_preferences (
      tenant_id, owner_alerts_enabled, min_severity, min_money_cents, notify_revenue, notify_financial,
      notify_customer, notify_legal, notify_safety, notify_automation, notify_low_confidence, notify_approval
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    on conflict (tenant_id) do update
    set owner_alerts_enabled = excluded.owner_alerts_enabled,
        min_severity = excluded.min_severity,
        min_money_cents = excluded.min_money_cents,
        notify_revenue = excluded.notify_revenue,
        notify_financial = excluded.notify_financial,
        notify_customer = excluded.notify_customer,
        notify_legal = excluded.notify_legal,
        notify_safety = excluded.notify_safety,
        notify_automation = excluded.notify_automation,
        notify_low_confidence = excluded.notify_low_confidence,
        notify_approval = excluded.notify_approval,
        updated_at = now()
    `,
    [
      tenantId,
      preferences.ownerAlertsEnabled,
      preferences.minSeverity,
      preferences.minMoneyCents,
      preferences.notifyRevenue,
      preferences.notifyFinancial,
      preferences.notifyCustomer,
      preferences.notifyLegal,
      preferences.notifySafety,
      preferences.notifyAutomation,
      preferences.notifyLowConfidence,
      preferences.notifyApproval
    ]
  );
}

export function pushPreferencesAllowEvent(input: {
  preferences: PushNotificationPreferences;
  severity: PushSeverity;
  status: string;
  ownerAttention: boolean;
  moneyCents: number;
  riskType?: PushRiskType | null;
}) {
  const preferences = input.preferences;
  if (!preferences.ownerAlertsEnabled) return false;
  if (input.status === "critical") return true;
  if (severityRank[input.severity] >= severityRank[preferences.minSeverity]) return true;
  if (input.moneyCents >= preferences.minMoneyCents) return true;
  if (input.ownerAttention && !input.riskType) return true;
  if (!input.riskType) return false;
  return Boolean(preferences[riskField[input.riskType]]);
}

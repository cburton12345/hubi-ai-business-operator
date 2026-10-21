export type ExternalAiUsageSnapshot = {
  requestCount: number;
  returnedRecordCount: number;
  recentRequestCount: number;
};

export type ExternalAiUsageLimits = {
  dailyRequestLimit: number;
  dailyRecordLimit: number;
};

export function evaluateExternalAiUsage(snapshot: ExternalAiUsageSnapshot, limits: ExternalAiUsageLimits) {
  if (snapshot.requestCount >= limits.dailyRequestLimit) {
    return { allowed: false, code: "DAILY_REQUEST_LIMIT_REACHED", notifyOwner: true } as const;
  }
  if (snapshot.returnedRecordCount >= limits.dailyRecordLimit) {
    return { allowed: false, code: "DAILY_RECORD_LIMIT_REACHED", notifyOwner: true } as const;
  }
  return {
    allowed: true,
    code: null,
    notifyOwner: snapshot.recentRequestCount >= Math.min(80, Math.max(20, Math.ceil(limits.dailyRequestLimit * 0.2))),
  } as const;
}

export function countReturnedRecords(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  if (Array.isArray(value)) return value.length;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.items)) return record.items.length;
  if (record.business || record.customer || record.job) return 1;
  return 0;
}

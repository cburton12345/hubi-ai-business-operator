export const managedSmsIncludedSegments = {
  free: 0,
  earn: 0,
  ferocity_connect: 0,
  calls: 100,
  job_tracker: 100,
  starter: 100,
  growth: 300,
  operator: 1000,
  managed_operator: 1000,
  pro_agency: 1000
} as const;

export function includedManagedSmsSegments(planKey: string | null | undefined) {
  return managedSmsIncludedSegments[planKey as keyof typeof managedSmsIncludedSegments] ?? 0;
}

export function managedSmsOverageUnits(input: {
  planKey: string | null | undefined;
  usedBefore: number;
  newUnits: number;
}) {
  const allowance = includedManagedSmsSegments(input.planKey);
  const usedBefore = Math.max(0, input.usedBefore);
  const newUnits = Math.max(0, input.newUnits);
  const overageBefore = Math.max(0, usedBefore - allowance);
  const overageAfter = Math.max(0, usedBefore + newUnits - allowance);
  return Math.max(0, overageAfter - overageBefore);
}

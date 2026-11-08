export type EmployeeInviteDeliveryResult =
  | { ok: true; providerMessageId?: string | null }
  | { ok: false; skipped?: boolean; error: string };

export async function attemptEmployeeInviteDelivery(
  operation: () => Promise<EmployeeInviteDeliveryResult>
): Promise<EmployeeInviteDeliveryResult> {
  try {
    return await operation();
  } catch {
    return { ok: false, error: "Invitation delivery failed unexpectedly." };
  }
}

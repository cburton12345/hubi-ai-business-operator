import { createHash } from "node:crypto";

export function normalizeEmployeeInviteEmail(email: string) {
  return email.trim().toLowerCase();
}

export function employeeInviteLockKey(tenantId: string, email: string) {
  return `employee-invite-delivery:${tenantId}:${normalizeEmployeeInviteEmail(email)}`;
}

export function employeeInviteEventId(tenantId: string, email: string) {
  const digest = createHash("sha256")
    .update(tenantId)
    .update("\0")
    .update(normalizeEmployeeInviteEmail(email))
    .digest("hex");
  return `employee-invite-delivery-${digest}`;
}

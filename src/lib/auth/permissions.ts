import type { PlatformRole, RiskLevel, TenantRole } from "@/types/core";

export type AccessActor = {
  userId: string;
  email: string;
  platformRole: PlatformRole;
  tenantRole?: TenantRole;
};

export type Permission =
  | "tenant:view"
  | "tenant:manage"
  | "brand:manage"
  | "lead:manage"
  | "ai:queue"
  | "approval:review_low"
  | "approval:review_medium"
  | "approval:review_high"
  | "billing:manage"
  | "platform:manage";

const tenantRolePermissions: Record<TenantRole, Permission[]> = {
  owner: [
    "tenant:view",
    "tenant:manage",
    "brand:manage",
    "lead:manage",
    "ai:queue",
    "approval:review_low",
    "approval:review_medium",
    "approval:review_high",
    "billing:manage"
  ],
  admin: [
    "tenant:view",
    "tenant:manage",
    "brand:manage",
    "lead:manage",
    "ai:queue",
    "approval:review_low",
    "approval:review_medium",
    "approval:review_high"
  ],
  operator: ["tenant:view", "brand:manage", "lead:manage", "ai:queue", "approval:review_low"],
  viewer: ["tenant:view"]
};

const platformRolePermissions: Record<PlatformRole, Permission[]> = {
  super_admin: ["platform:manage", "tenant:view", "tenant:manage", "brand:manage", "lead:manage", "ai:queue", "approval:review_low", "approval:review_medium", "approval:review_high", "billing:manage"],
  support: ["tenant:view", "lead:manage", "approval:review_low"],
  user: []
};

export function getActorPermissions(actor: AccessActor) {
  return new Set([
    ...platformRolePermissions[actor.platformRole],
    ...(actor.tenantRole ? tenantRolePermissions[actor.tenantRole] : [])
  ]);
}

export function can(actor: AccessActor, permission: Permission) {
  return getActorPermissions(actor).has(permission);
}

export function canReviewRisk(actor: AccessActor, riskLevel: RiskLevel) {
  if (riskLevel === "low") {
    return can(actor, "approval:review_low");
  }

  if (riskLevel === "medium") {
    return can(actor, "approval:review_medium");
  }

  return can(actor, "approval:review_high");
}

export function describeTenantRole(role: TenantRole) {
  const labels: Record<TenantRole, string> = {
    owner: "Full workspace control, billing-ready ownership, high-risk approvals.",
    admin: "Workspace management, brand operations, and high-risk approvals.",
    operator: "Lead, brand, AI queue, and low-risk review work.",
    viewer: "Read-only workspace visibility."
  };

  return labels[role];
}

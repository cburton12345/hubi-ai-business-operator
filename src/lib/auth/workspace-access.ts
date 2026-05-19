import type { PlatformRole, TenantRole } from "@/types/core";

export type WorkspaceAccessSubject = {
  platformRole: PlatformRole;
  workspaceRole?: TenantRole;
  workspaceId: string;
};

export function canAccessWorkspace(subject: WorkspaceAccessSubject, requestedWorkspaceId: string) {
  if (subject.platformRole === "super_admin") return true;
  return Boolean(subject.workspaceRole && subject.workspaceId === requestedWorkspaceId);
}

export function canManageBrandInWorkspace(subject: WorkspaceAccessSubject, requestedWorkspaceId: string, brandRule?: { role: "admin" | "operator" | "viewer"; status: string }) {
  if (!canAccessWorkspace(subject, requestedWorkspaceId)) return false;
  if (subject.workspaceRole === "owner" || subject.workspaceRole === "admin") return true;
  if (!brandRule || brandRule.status !== "active") return subject.workspaceRole === "operator";
  return brandRule.role === "admin" || brandRule.role === "operator";
}

import { describe, expect, it } from "vitest";
import { canAccessWorkspace, canManageBrandInWorkspace } from "@/lib/auth/workspace-access";

describe("workspace access isolation", () => {
  it("blocks regular users from other organizations", () => {
    expect(
      canAccessWorkspace(
        {
          platformRole: "user",
          workspaceRole: "admin",
          workspaceId: "workspace-a"
        },
        "workspace-b"
      )
    ).toBe(false);
  });

  it("lets platform super admins inspect any organization", () => {
    expect(
      canAccessWorkspace(
        {
          platformRole: "super_admin",
          workspaceId: "workspace-a"
        },
        "workspace-b"
      )
    ).toBe(true);
  });

  it("uses brand rules without crossing workspace boundaries", () => {
    expect(
      canManageBrandInWorkspace(
        {
          platformRole: "user",
          workspaceRole: "viewer",
          workspaceId: "workspace-a"
        },
        "workspace-a",
        { role: "operator", status: "active" }
      )
    ).toBe(true);

    expect(
      canManageBrandInWorkspace(
        {
          platformRole: "user",
          workspaceRole: "admin",
          workspaceId: "workspace-a"
        },
        "workspace-b",
        { role: "admin", status: "active" }
      )
    ).toBe(false);
  });
});

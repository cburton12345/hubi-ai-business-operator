import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/app/ferocity/page.tsx", "utf8");
const actions = readFileSync("src/app/app/ferocity/actions.ts", "utf8");

describe("owner chat thread isolation", () => {
  it("requires AI queue permission before loading owner chat data", () => {
    expect(page).toContain('requirePermission("ai:queue")');
  });

  it("limits non-manager thread listing, thread reuse, and transcript context to the creating user", () => {
    expect(page).toContain("($2::boolean or created_by_user_id = $3)");
    expect(actions).toContain("($3::boolean or created_by_user_id = $4)");
    expect(actions).toContain("($3::boolean or thread.created_by_user_id=$4)");
  });

  it("does not accept operator-submitted onboarding configuration", () => {
    expect(actions).toContain('access.canConfigureOnboarding && onboardingContext.onboardingMode === "true"');
  });

  it("requires tenant management for goal controls", () => {
    const control = actions.slice(actions.indexOf("export async function controlOperatingGoalAction"));
    expect(control).toContain('requirePermission("tenant:manage")');
  });
});

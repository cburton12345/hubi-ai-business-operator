import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildOwnerDailyBrief,
  buildOwnerTwinSuggestions,
  ownerCommandFamily,
} from "@/lib/ferocity/owner-operating-twin";

describe("owner operating twin suggestions", () => {
  it("preserves the owner's wording and learns repeated next-command sequences", () => {
    const suggestions = buildOwnerTwinSuggestions([
      { body: "whats left with everything", succeeded: true },
      { body: "keep going and do the next things", succeeded: true },
      { body: "what is left on all platforms", succeeded: true },
      { body: "keep going and do the next things", succeeded: true },
      { body: "whats next with everything", succeeded: true },
    ], { command: "Audit the current business and choose the next move.", title: "Audit the business" });
    expect(suggestions[0]?.command).toBe("keep going and do the next things");
    expect(suggestions[0]?.confidence).toBeGreaterThan(0.7);
    expect(suggestions[0]?.suggestionKey).toMatch(/^[a-f0-9]{32}$/);
    expect(suggestions[0]?.channel).toBe("internal_command");
    expect(suggestions[0]?.evidenceHref).toBe("/app/ferocity");
  });

  it("never learns credentials and keeps consequential suggestions draft-only", () => {
    const suggestions = buildOwnerTwinSuggestions([
      { body: "password is do-not-store-this", succeeded: true },
      { body: "send the customer an email", succeeded: true },
      { body: "check new leads", succeeded: true },
      { body: "send the customer an email", succeeded: true },
      { body: "check new leads", succeeded: true },
    ], { command: "Review current leads without contacting anyone.", title: "Review leads" });
    expect(suggestions.some((item) => item.command.includes("password"))).toBe(false);
    expect(suggestions.find((item) => item.command.includes("send the customer"))?.executionMode).toBe("draft_only");
  });

  it("classifies the owner's terse continuation language", () => {
    expect(ownerCommandFamily("ok lets keep going whats next")).toBe("continue");
  });

  it("isolates evidence by tenant before learning", () => {
    const suggestions = buildOwnerTwinSuggestions([
      { tenantId: "workspace-a", body: "whats next", succeeded: true },
      { tenantId: "workspace-b", body: "email every customer", succeeded: true },
      { tenantId: "workspace-b", body: "whats next", succeeded: true },
      { tenantId: "workspace-b", body: "email every customer", succeeded: true },
      { tenantId: "workspace-a", body: "whats next", succeeded: true },
    ], { command: "Review the owner queue.", title: "Review owner queue" }, { tenantId: "workspace-a" });
    expect(suggestions.some((item) => item.command === "email every customer")).toBe(false);
  });

  it("removes dismissed suggestions and boosts accepted feedback", () => {
    const dismissed = buildOwnerTwinSuggestions([
      { body: "check new leads", succeeded: true },
      { body: "review vendor applications", succeeded: true },
      { body: "check new leads", succeeded: true },
    ], { command: "Review vendor applications", title: "Review vendors" }, {
      feedback: [{ command: "review vendor applications", feedback: "dismissed" }],
    });
    expect(dismissed.some((item) => item.command.toLowerCase() === "review vendor applications")).toBe(false);

    const accepted = buildOwnerTwinSuggestions([
      { body: "whats next", succeeded: true },
    ], { command: "Review the owner queue.", title: "Review owner queue" }, {
      feedback: [{ command: "Call the highest priority lead", feedback: "accepted", evidenceHref: "/app/leads" }],
    });
    expect(accepted[0]).toMatchObject({
      command: "Call the highest priority lead",
      channel: "phone",
      executionMode: "draft_only",
      evidenceHref: "/app/leads",
    });
  });

  it("builds a bounded evidence-linked daily brief without claiming completion", () => {
    const brief = buildOwnerDailyBrief({
      attentionCount: 2.8,
      opportunityCount: Number.NaN,
      approvalCount: -4,
      activeGoalCount: 1,
      setupRemainingCount: 3,
      topPriority: { title: "Review lead", detail: "Evidence is available.", href: "https://unsafe.example" },
    });
    expect(brief.items.map((item) => item.count)).toEqual([2, 1, 3]);
    expect(brief.summary).toContain("live evidence");
    expect(brief.topPriority.href).toBe("/app/attention-command");
  });

  it("keeps feedback server-mediated, tenant-scoped, and time-bounded", () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/290_owner_twin_feedback_and_retention.sql"),
      "utf8",
    ).toLowerCase();
    expect(migration).toContain("unique (tenant_id, user_id, suggestion_key)");
    expect(migration).toContain("interval '365 days'");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.owner_twin_suggestion_feedback from public, anon, authenticated, service_role");
    expect(migration).toContain("grant select, insert, update, delete on table public.owner_twin_suggestion_feedback to service_role");
    expect(migration).not.toContain("create policy");
  });
});


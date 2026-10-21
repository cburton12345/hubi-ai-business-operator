import { describe, expect, it } from "vitest";
import { normalizeEmployeeChatDecision } from "@/lib/employee/employee-chat";

const assignment = {
  assignmentId: "11111111-1111-4111-8111-111111111111",
  visitId: "22222222-2222-4222-8222-222222222222",
  title: "Repair kitchen sink",
  jobsite: "Assigned property",
  scheduledStart: null,
  scheduledEnd: null,
  status: "scheduled",
  priority: "normal",
  tasks: [{ index: 0, title: "Replace valve", status: "open" as const }]
};

describe("employee Ferocity decision boundary", () => {
  it("accepts an explicit action only when it targets assigned work", () => {
    const result = normalizeEmployeeChatDecision({
      answer: "I can mark that task done.",
      language: "en",
      action: { type: "mark_task_done", assignmentId: assignment.assignmentId, taskIndex: 0 }
    }, "en", [assignment]);
    expect(result.action).toEqual({ type: "mark_task_done", assignmentId: assignment.assignmentId, taskIndex: 0 });
  });

  it("drops an action that targets unrelated work", () => {
    const result = normalizeEmployeeChatDecision({
      answer: "I will handle it.",
      language: "en",
      action: { type: "mark_task_done", assignmentId: "33333333-3333-4333-8333-333333333333", taskIndex: 0 }
    }, "en", [assignment]);
    expect(result.action).toEqual({ type: "none" });
  });

  it("preserves Spanish while rejecting an unsafe visit status", () => {
    const result = normalizeEmployeeChatDecision({
      answer: "Necesito que la oficina lo revise.",
      language: "es",
      action: { type: "update_visit_status", visitId: assignment.visitId, status: "paid" }
    }, "en", [assignment]);
    expect(result.language).toBe("es");
    expect(result.action).toEqual({ type: "none" });
  });

  it("uses a localized safe fallback for malformed model output", () => {
    const result = normalizeEmployeeChatDecision({ action: { type: "delete_job" } }, "es", [assignment]);
    expect(result.language).toBe("es");
    expect(result.answer).toContain("trabajo asignado");
    expect(result.action).toEqual({ type: "none" });
  });
});

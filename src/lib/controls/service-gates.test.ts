import { describe, expect, it } from "vitest";
import { minimumPlanForFeature, planMeetsMinimum, usesCountBasedLimit } from "./service-gates";

describe("Ferocity core AI plan boundaries", () => {
  it("includes the Authority Engine in Starter", () => {
    expect(minimumPlanForFeature("authority_engine")).toBe("starter");
    expect(planMeetsMinimum("starter", minimumPlanForFeature("authority_engine"))).toBe(true);
  });

  it("keeps advanced authority building in Growth", () => {
    expect(minimumPlanForFeature("authority_builder")).toBe("growth");
    expect(planMeetsMinimum("starter", minimumPlanForFeature("authority_builder"))).toBe(false);
    expect(planMeetsMinimum("growth", minimumPlanForFeature("authority_builder"))).toBe(true);
  });

  it("keeps backlink and link-opportunity intelligence in Growth", () => {
    expect(minimumPlanForFeature("authority_link_intelligence")).toBe("growth");
    expect(planMeetsMinimum("starter", minimumPlanForFeature("authority_link_intelligence"))).toBe(false);
    expect(planMeetsMinimum("growth", minimumPlanForFeature("authority_link_intelligence"))).toBe(true);
  });

  it("includes the AI Office Manager in Starter", () => {
    expect(minimumPlanForFeature("ai_office_manager")).toBe("starter");
    expect(planMeetsMinimum("starter", minimumPlanForFeature("ai_office_manager"))).toBe(true);
  });

  it("includes construction Job Health in the Job Tracker plan", () => {
    expect(minimumPlanForFeature("construction_job_health")).toBe("job_tracker");
    expect(planMeetsMinimum("job_tracker", minimumPlanForFeature("construction_job_health"))).toBe(true);
    expect(planMeetsMinimum("free", minimumPlanForFeature("construction_job_health"))).toBe(false);
  });

  it("does not block core AI with an arbitrary request counter", () => {
    expect(usesCountBasedLimit("ai_generation")).toBe(false);
    expect(usesCountBasedLimit("sms_send")).toBe(true);
    expect(usesCountBasedLimit("ai_video_generation")).toBe(true);
  });
});

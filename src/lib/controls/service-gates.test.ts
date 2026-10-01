import { describe, expect, it } from "vitest";
import {
  billingAllowsWorkspaceActions,
  minimumPlanForFeature,
  planAllowsFeature,
  planMeetsMinimum,
  usesCountBasedLimit
} from "./service-gates";

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

  it("gives the Calls plan phone-to-opportunity capabilities without unlocking the full platform", () => {
    expect(planAllowsFeature("calls", "voice_ai")).toBe(true);
    expect(planAllowsFeature("calls", "calendar_sync")).toBe(true);
    expect(planAllowsFeature("calls", "follow_up_recovery")).toBe(true);
    expect(planAllowsFeature("calls", "seo_autopilot")).toBe(false);
    expect(planAllowsFeature("calls", "payment_collection")).toBe(false);
  });

  it("allows advertised managed voice access on every full Ferocity plan", () => {
    expect(planAllowsFeature("earn", "voice_ai")).toBe(true);
    expect(planAllowsFeature("starter", "voice_ai")).toBe(true);
    expect(planAllowsFeature("growth", "voice_ai")).toBe(true);
    expect(planAllowsFeature("operator", "voice_ai")).toBe(true);
  });

  it("treats Earn as the performance-priced full operating system rather than Free", () => {
    expect(planMeetsMinimum("earn", "operator")).toBe(true);
    expect(planAllowsFeature("earn", "content_studio")).toBe(true);
    expect(planAllowsFeature("earn", "payment_collection")).toBe(true);
    expect(planAllowsFeature("earn", "ai_video_generation")).toBe(true);
  });

  it("allows Ferocity Connect SMS without unlocking the full operating system", () => {
    expect(planAllowsFeature("ferocity_connect", "sms_send")).toBe(true);
    expect(planAllowsFeature("ferocity_connect", "follow_up_recovery")).toBe(true);
    expect(planAllowsFeature("ferocity_connect", "voice_ai")).toBe(false);
    expect(planAllowsFeature("job_tracker", "sms_send")).toBe(true);
  });

  it("allows Ferocity-owned internal AI surfaces without inventing a customer subscription", () => {
    expect(billingAllowsWorkspaceActions({
      accountType: "internal",
      billingAccess: { allowPaidActions: false },
      planKey: "pro_agency"
    })).toBe(true);
  });

  it("continues enforcing subscription access for customer workspaces", () => {
    expect(billingAllowsWorkspaceActions({
      accountType: "customer",
      billingAccess: { allowPaidActions: false },
      planKey: "growth"
    })).toBe(false);
    expect(billingAllowsWorkspaceActions({
      accountType: "customer",
      billingAccess: { allowPaidActions: true },
      planKey: "growth"
    })).toBe(true);
  });
});

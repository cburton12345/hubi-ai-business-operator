import { afterEach, describe, expect, it } from "vitest";
import { independentReviewerConfigured, managedModelForRunType, workloadTierForRunType } from "./model-routing";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("AI workload routing", () => {
  it("classifies known workflows without treating every task as frontier work", () => {
    expect(workloadTierForRunType("receipt_vision_extraction")).toBe("economy");
    expect(workloadTierForRunType("public_website_chat_reply")).toBe("advanced");
    expect(workloadTierForRunType("public_website_chat_reply_recovery")).toBe("balanced");
    expect(workloadTierForRunType("growth_funnel_strategy")).toBe("advanced");
    expect(workloadTierForRunType("expense_allocation_reasoning_advanced")).toBe("advanced");
    expect(workloadTierForRunType("future_workflow")).toBe("balanced");
  });

  it("preserves the existing model unless a tier override is deliberately configured", () => {
    process.env.AI_MODEL = "gpt-4.1-mini";
    delete process.env.AI_MODEL_ECONOMY;
    delete process.env.AI_MODEL_BALANCED;
    delete process.env.AI_MODEL_ADVANCED;
    expect(managedModelForRunType({ runType: "receipt_vision_extraction", requestType: "json" })).toBe("gpt-4.1-mini");
    expect(managedModelForRunType({ runType: "growth_funnel_strategy", requestType: "json" })).toBe("gpt-4.1-mini");
  });

  it("supports independent economy, balanced, advanced, and vision choices", () => {
    process.env.AI_MODEL = "fallback";
    process.env.AI_MODEL_ECONOMY = "economy";
    process.env.AI_MODEL_BALANCED = "balanced";
    process.env.AI_MODEL_ADVANCED = "advanced";
    process.env.AI_VISION_MODEL = "vision";
    expect(managedModelForRunType({ runType: "receipt_vision_extraction", requestType: "json" })).toBe("economy");
    expect(managedModelForRunType({ runType: "setup_guidance", requestType: "json" })).toBe("balanced");
    expect(managedModelForRunType({ runType: "adapter_factory_manifest", requestType: "json" })).toBe("advanced");
    expect(managedModelForRunType({ runType: "receipt_vision_extraction", requestType: "vision_json" })).toBe("vision");
  });

  it("requires the reviewer lane to use a deliberately distinct model", () => {
    process.env.AI_MODEL = "primary";
    process.env.AI_MODEL_REVIEWER = "reviewer";
    expect(managedModelForRunType({ runType: "independent_review_expense_document_text", requestType: "json" })).toBe("reviewer");
    expect(independentReviewerConfigured({ primaryRunType: "expense_document_text_extraction", requestType: "json" })).toBe(true);
    process.env.AI_MODEL_REVIEWER = "primary";
    expect(independentReviewerConfigured({ primaryRunType: "expense_document_text_extraction", requestType: "json" })).toBe(false);
  });

  it("does not route statement rows through the global frontier reviewer", () => {
    process.env.AI_MODEL = "primary";
    process.env.AI_MODEL_BALANCED = "primary";
    process.env.AI_MODEL_REVIEWER = "frontier";
    delete process.env.AI_MODEL_STATEMENT_REVIEWER;
    expect(managedModelForRunType({ runType: "independent_review_expense_statement_classification", requestType: "json" })).toBe("primary");
    expect(independentReviewerConfigured({
      primaryRunType: "expense_statement_classification",
      reviewerRunType: "independent_review_expense_statement_classification",
      requestType: "json",
    })).toBe(false);
    process.env.AI_MODEL_STATEMENT_REVIEWER = "statement-reviewer";
    expect(independentReviewerConfigured({
      primaryRunType: "expense_statement_classification",
      reviewerRunType: "independent_review_expense_statement_classification",
      requestType: "json",
    })).toBe(true);
  });
});

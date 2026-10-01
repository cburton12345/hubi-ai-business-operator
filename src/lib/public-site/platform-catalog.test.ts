import { describe, expect, it } from "vitest";
import {
  getPublicPlatform,
  publicPlatformFallback,
  publicPlatformKnowledge,
  publicPlatforms
} from "./platform-catalog";

describe("public platform catalog", () => {
  it("gives every platform plans, signup, details, and contextual chat routes", () => {
    expect(publicPlatforms).toHaveLength(7);
    for (const platform of publicPlatforms) {
      expect(platform.plansHref).toMatch(/^\//);
      expect(platform.startHref).toMatch(/^\//);
      expect(platform.detailsHref).toMatch(/^\//);
      expect(platform.pricing.length).toBeGreaterThan(4);
      expect(platform.costNotes.length).toBeGreaterThan(20);
      expect(platform.capabilities.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("preserves the most important transparent pricing qualifications", () => {
    expect(getPublicPlatform("earn")?.pricing).toContain("0.9%");
    expect(getPublicPlatform("earn")?.pricing).toContain("6%");
    expect(getPublicPlatform("calls")?.pricing).toContain("$0.25");
    expect(getPublicPlatform("ferocity_connect")?.costNotes.toLowerCase()).toContain("carrier");
    expect(getPublicPlatform("operating_system")?.costNotes.toLowerCase()).toContain("third-party");
  });

  it("supplies public-safe model knowledge and a useful deterministic fallback", () => {
    const knowledge = JSON.stringify(publicPlatformKnowledge()).toLowerCase();
    expect(knowledge).not.toContain("client_secret");
    expect(knowledge).not.toContain("api key");
    expect(publicPlatformFallback("What does it cost?", "ferocity_connect")).toContain("$29/mo");
    expect(publicPlatformFallback("How do I start?", "calls")).toContain("setup:");
    expect(publicPlatformFallback("Help me choose")).toContain("where the result breaks down");
  });

  it("turns a described business bottleneck into a concrete first plan", () => {
    const reply = publicPlatformFallback(
      "I run an accounting firm. New inquiries sit too long, client documents get lost in email, and invoices are paid late."
    );
    expect(reply).toContain("Stop leads from cooling off");
    expect(reply).toContain("End document and communication handoff gaps");
    expect(reply).toContain("Shorten the path to payment");
    expect(reply).toContain("create the missing workflow");
    expect(reply).not.toContain("Starter $149/mo");
    expect(reply).toContain("Which systems currently hold the customer record, active work, and invoices?");
  });

  it("uses prior answers instead of restarting the intake when AI generation falls back", () => {
    const reply = publicPlatformFallback(
      "We use a shared inbox but nobody clearly owns the next response.",
      null,
      [
        "I run a dental practice and new-patient leads go cold.",
        "We use a shared inbox but nobody clearly owns the next response."
      ]
    );
    expect(reply).toContain("Based on what you have shared");
    expect(reply).toContain("Stop leads from cooling off");
    expect(reply).toContain("create that missing operating path");
    expect(reply).not.toContain("Tell me what kind of business you run");
  });

  it("still gives a useful multi-area diagnosis when the live AI provider falls back", () => {
    const reply = publicPlatformFallback(
      "We miss calls, employees text their hours, receipts get lost, and we need better local SEO and video."
    );
    expect(reply).toContain("Stop valuable calls from reaching a dead end");
    expect(reply).toContain("Give the workforce one simple operating rhythm");
    expect(reply).toContain("Turn paperwork into usable financial control");
    expect(reply).toContain("Grow from what actually produces business");
    expect(reply).not.toContain("Tell me what kind of business you run");
  });

  it("answers an ambitious business goal directly instead of repeating intake", () => {
    const reply = publicPlatformFallback(
      "I am a small lawyer but I want to make a million dollars",
      null,
      ["Help me find the biggest bottleneck in my business.", "I am a small lawyer but I want to make a million dollars"]
    );
    expect(reply).toContain("Turn the growth goal into business math");
    expect(reply).toContain("Build a dependable opportunity-to-customer path");
    expect(reply).toContain("Make sure growth remains deliverable and profitable");
    expect(reply).toContain("Which product or service produces your best customers");
    expect(reply).not.toContain("where the process breaks today");
  });

  it.each([
    "I own a roofing company and want to reach five million in revenue.",
    "My ecommerce brand needs to double sales without destroying margin.",
    "I run a dental office and need more patients while protecting capacity.",
    "Our accounting firm wants to grow without everything depending on me."
  ])("uses the same goal reasoning across industries: %s", (message) => {
    const reply = publicPlatformFallback(message);
    expect(reply).toContain("Turn the growth goal into business math");
    expect(reply).toContain("Make sure growth remains deliverable and profitable");
    expect(reply).not.toContain("law practice");
  });

  it("recognizes a capacity goal even when revenue growth is not mentioned", () => {
    const reply = publicPlatformFallback("We are a nonprofit trying to serve more families with the same staff.");
    expect(reply).toContain("Increase capacity without increasing owner drag");
    expect(reply).not.toContain("where the result breaks down");
  });

  it("treats margin pressure as profitability, not merely collections", () => {
    const reply = publicPlatformFallback("I run a restaurant and food cost is killing our margin.");
    expect(reply).toContain("healthy margin");
    expect(reply).not.toContain("Shorten the path to payment");
  });

  it("recovers clearly when a visitor says the response made no sense", () => {
    const reply = publicPlatformFallback(
      "Wtf are you talking about",
      null,
      ["I am a small lawyer but I want to make a million dollars", "What?", "Wtf are you talking about"]
    );
    expect(reply).toContain("Sorry—I overcomplicated that");
    expect(reply).toContain("grow the business substantially");
    expect(reply).toContain("Which product or service produces your best customers");
    expect(reply).not.toContain("law practice");
    expect(reply).not.toContain("rather than restarting the intake");
  });
});

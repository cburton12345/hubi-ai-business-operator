import { describe, expect, it } from "vitest";
import {
  facebookActionConfirmationSchema,
  facebookCommunityObservationSchema,
  facebookHealthSchema,
  facebookObservationSchema,
  isFacebookChromeNoise,
  normalizeFacebookGroupUrl,
  normalizePairingCode
} from "./facebook-connector-protocol";

describe("Facebook connector protocol", () => {
  it("normalizes human-entered one-time codes", () => {
    expect(normalizePairingCode("abcd-1234-ef56")).toBe("ABCD1234EF56");
  });

  it("requires a stable observed source and supported surface", () => {
    const base = {
      providerEventId: "event-1", externalConversationRef: "thread-1", externalActorId: "actor-1",
      body: "Looking for a roofer in Eau Claire", sourceUrl: "https://www.facebook.com/groups/1/posts/2",
      surface: "group", connectorVersion: "0.1.0"
    };
    expect(facebookObservationSchema.safeParse(base).success).toBe(true);
    expect(facebookObservationSchema.safeParse({ ...base, surface: "unknown" }).success).toBe(false);
    expect(facebookObservationSchema.safeParse({ ...base, sourceUrl: "https://example.com/messages" }).success).toBe(false);
    expect(facebookObservationSchema.safeParse({ ...base, body: "Type a message" }).success).toBe(false);
  });

  it("rejects common Facebook interface chrome without rejecting real short replies", () => {
    expect(isFacebookChromeNoise("Message requests")).toBe(true);
    expect(isFacebookChromeNoise("Yes, Tuesday works")).toBe(false);
  });

  it("accepts explicit provider safety states", () => {
    expect(facebookHealthSchema.safeParse({ state: "verification_required", url: "https://www.facebook.com/checkpoint", connectorVersion: "0.1.0" }).success).toBe(true);
    expect(facebookHealthSchema.safeParse({
      state: "ready", url: "https://www.facebook.com/messages/requests", connectorVersion: "marketplace-worker-0.1.0",
      transportType: "windows_worker", runtimeState: "idle", browserState: "closed"
    }).success).toBe(true);
    expect(facebookHealthSchema.safeParse({
      state: "ready", url: "https://www.facebook.com/messages/requests", connectorVersion: "0.1.0",
      transportType: "untrusted_runner"
    }).success).toBe(false);
  });

  it("accepts only specific Facebook groups for community observations", () => {
    const observation = {
      providerEventId: "group-1:rules-1", externalCommunityId: "123", name: "Eau Claire homeowners",
      url: "https://www.facebook.com/groups/123/?ref=share", rulesText: "Local businesses may post on Tuesdays.",
      rulesSourceUrl: "https://www.facebook.com/groups/123/about", membershipState: "joined",
      connectorVersion: "marketplace-worker-0.2.0"
    };
    expect(facebookCommunityObservationSchema.safeParse(observation).success).toBe(true);
    expect(normalizeFacebookGroupUrl(observation.url)).toBe("https://www.facebook.com/groups/123");
    expect(facebookCommunityObservationSchema.safeParse({ ...observation, url: "https://www.facebook.com/groups/feed/" }).success).toBe(false);
    expect(facebookCommunityObservationSchema.safeParse({ ...observation, url: "https://example.com/groups/123" }).success).toBe(false);
  });

  it("does not accept an unexplained failed action", () => {
    const actionId = "7e31f66c-a284-4d37-9f74-6a541b6d53cd";
    expect(facebookActionConfirmationSchema.safeParse({ actionId, outcome: "succeeded" }).success).toBe(true);
    expect(facebookActionConfirmationSchema.safeParse({ actionId, outcome: "failed" }).success).toBe(false);
    expect(facebookActionConfirmationSchema.safeParse({ actionId, outcome: "failed", failureMessage: "Composer changed." }).success).toBe(true);
  });
});

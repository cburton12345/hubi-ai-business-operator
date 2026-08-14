import { describe, expect, it } from "vitest";
import { canonicalizeVoiceDisposition } from "./call-contact-reconciliation";

describe("canonicalizeVoiceDisposition", () => {
  it.each([
    ["appointment_booked", "scheduled"],
    ["callback requested", "followup_needed"],
    ["human-handoff", "transferred"],
    ["wrong number", "spam"],
    ["something provider-specific", "unresolved"]
  ])("maps %s to %s", (input, expected) => {
    expect(canonicalizeVoiceDisposition(input)).toBe(expected);
  });
});

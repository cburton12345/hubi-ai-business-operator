import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("voice agent publish, test, and activation lifecycle", () => {
  const setupActions = fs.readFileSync(
    path.join(process.cwd(), "src/app/app/receptionist-setup/actions.ts"),
    "utf8"
  );
  const webhook = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/integrations/voice-ai/webhook/route.ts"),
    "utf8"
  );

  it("does not treat placing a test call as a passed test", () => {
    expect(setupActions).toContain("test_status = 'in_progress'");
    expect(setupActions).not.toContain("test_status = 'complete', activation_status = 'complete'");
  });

  it("requires certified test evidence and an inbound number before activation", () => {
    expect(setupActions).toContain("test_status='complete'");
    expect(setupActions).toContain("lastSuccessfulTestCallAt");
    expect(setupActions).toContain("status='active' and inbound_enabled");
    expect(setupActions).toContain("route_family='voice_orchestrator'");
  });

  it("passes a test only after a final usable call with a transcript", () => {
    expect(webhook).toContain("source === \"receptionist_setup_test\"");
    expect(webhook).toContain("[\"completed\", \"transferred\"].includes(status)");
    expect(webhook).toContain("durationSeconds > 0 && Boolean(transcriptText)");
    expect(webhook).toContain('testPassed ? "complete" : "needs_attention"');
  });

  it("covers the complete post-call Ferocity path", () => {
    expect(webhook).toContain("reconcileCallContact({");
    expect(webhook).toContain("createVoiceAppointment({");
    expect(webhook).toContain("recordVoiceUsage({");
    expect(webhook).toContain("orchestrateCompletedCall({");
    expect(webhook).toContain("safelyEnqueueExternalCallLogHandoffs({");
  });
});

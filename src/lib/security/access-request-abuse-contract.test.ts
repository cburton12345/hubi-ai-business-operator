import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/api/access-requests/route.ts", "utf8").replaceAll("\r\n", "\n");

describe("public setup abuse containment contract", () => {
  it("limits clients, recipient identities, repeated payloads, and distributed volume", () => {
    expect(source).toContain('scope: "access_request_client_hour"');
    expect(source).toContain('scope: "access_request_email_day"');
    expect(source).toContain('scope: "access_request_payload_day"');
    expect(source).toContain('scope: "access_request_global_hour"');
    expect(source).toContain('scope: "access_request_global_day"');
    expect(source).toContain('"minimal-access-request"');
  });

  it("reserves email capacity with recipient and global notification budgets", () => {
    expect(source).toContain('scope: "access_request_confirmation_recipient_day"');
    expect(source).toContain('scope: "access_request_confirmation_global_day"');
    expect(source).toContain('scope: "access_request_admin_notice_duplicate"');
    expect(source).toContain('scope: "access_request_admin_notice_global_day"');
    expect(source).toContain("Public setup confirmation daily budget reached.");
    expect(source).toContain("A duplicate setup admin notification was suppressed.");
  });

  it("rejects oversized form bodies before parsing them", () => {
    expect(source).toContain('request.headers.get("content-length")');
    expect(source).toContain("contentLength > 64_000");
  });
});

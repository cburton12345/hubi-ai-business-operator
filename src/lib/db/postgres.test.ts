import { describe, expect, it } from "vitest";
import { databaseSslOptions } from "./postgres";

describe("databaseSslOptions", () => {
  it("retains encrypted compatibility when a project CA is not supplied", () => {
    expect(databaseSslOptions("")).toEqual({ rejectUnauthorized: false });
  });

  it("enables certificate verification for a base64-encoded PEM CA", () => {
    const pem = "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----";
    expect(databaseSslOptions(Buffer.from(pem).toString("base64"))).toEqual({
      rejectUnauthorized: true,
      ca: pem
    });
  });

  it("rejects malformed CA configuration", () => {
    expect(() => databaseSslOptions(Buffer.from("not a certificate").toString("base64")))
      .toThrow("not a valid PEM certificate");
  });
});

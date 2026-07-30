import { describe, expect, it } from "vitest";
import { maxFieldMediaUploadBytes, validateFieldMediaFile } from "./field-media-upload";

describe("validateFieldMediaFile", () => {
  it("accepts a phone photo", () => {
    const file = new File(["photo"], "job.jpg", { type: "image/jpeg" });
    expect(validateFieldMediaFile(file)).toBe("ready");
  });

  it("rejects executable files", () => {
    const file = new File(["binary"], "unsafe.exe", { type: "application/x-msdownload" });
    expect(validateFieldMediaFile(file)).toBe("unsupported_type");
  });

  it("rejects files beyond the private bucket limit", () => {
    const file = {
      name: "large.mp4",
      type: "video/mp4",
      size: maxFieldMediaUploadBytes + 1
    } as File;
    expect(validateFieldMediaFile(file)).toBe("too_large");
  });
});

import { describe, expect, it } from "vitest";
import { workerLocale, workerPlural, withWorkerLocale } from "./worker-locale";

describe("worker locale helpers", () => {
  it("accepts only the supported Spanish locale", () => {
    expect(workerLocale("es")).toBe("es");
    expect(workerLocale("en")).toBe("en");
    expect(workerLocale("es-MX")).toBe("en");
    expect(workerLocale(undefined)).toBe("en");
  });

  it("preserves existing route state while adding Spanish", () => {
    expect(withWorkerLocale("/login?mode=field&next=/employee#form", "es"))
      .toBe("/login?mode=field&next=%2Femployee&lang=es#form");
    expect(withWorkerLocale("/login?mode=field&next=/employee", "en"))
      .toBe("/login?mode=field&next=/employee");
  });

  it("uses locale plural rules", () => {
    const forms = { en: ["change", "changes"] as [string, string], es: ["cambio", "cambios"] as [string, string] };
    expect(workerPlural(1, "en", forms)).toBe("change");
    expect(workerPlural(2, "en", forms)).toBe("changes");
    expect(workerPlural(1, "es", forms)).toBe("cambio");
    expect(workerPlural(0, "es", forms)).toBe("cambios");
  });
});

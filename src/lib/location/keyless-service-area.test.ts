import { describe, expect, it } from "vitest";
import {
  evaluateServiceAreaFit,
  haversineMiles,
  keylessRouteClusterKey,
  normalizePostalCode
} from "./keyless-service-area";

describe("keyless service-area intelligence", () => {
  it("normalizes postal codes without a mapping provider", () => {
    expect(normalizePostalCode(" 547 01 ")).toBe("54701");
  });

  it("matches exact ZIP codes before broader location rules", () => {
    expect(evaluateServiceAreaFit(
      { city: "Eau Claire", state: "WI", postalCode: "54701", radiusMiles: 25 },
      { city: "Altoona", state: "WI", postalCode: "54701" }
    )).toEqual({ matched: true, method: "postal_code", distanceMiles: 0 });
  });

  it("matches a city and state when coordinates are not available", () => {
    expect(evaluateServiceAreaFit(
      { city: "Eau Claire", state: "WI" },
      { city: "eau claire", state: "wi" }
    ).method).toBe("city_state");
  });

  it("uses radius matching when both points have coordinates", () => {
    const result = evaluateServiceAreaFit(
      { latitude: 44.8113, longitude: -91.4985, radiusMiles: 20 },
      { latitude: 44.8036, longitude: -91.4427 }
    );
    expect(result.method).toBe("radius");
    expect(result.matched).toBe(true);
    expect(result.distanceMiles).toBeLessThan(5);
  });

  it("creates stable keyless route clusters", () => {
    expect(keylessRouteClusterKey({ postalCode: "54701", city: "Eau Claire", state: "WI" })).toBe("1:54701");
    expect(keylessRouteClusterKey({ city: "Eau Claire", state: "WI" })).toBe("2:wi:eau claire");
  });

  it("calculates real-world distances", () => {
    expect(haversineMiles(
      { latitude: 44.8113, longitude: -91.4985 },
      { latitude: 44.9537, longitude: -92.9954 }
    )).toBeGreaterThan(60);
  });
});

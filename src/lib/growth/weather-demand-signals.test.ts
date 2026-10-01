import { describe, expect, it } from "vitest";
import { alertMatchesTextServiceArea, classifyWeatherDemand, normalizeNwsAlert } from "./weather-demand-signals";

const alert = normalizeNwsAlert({
  id: "https://api.weather.gov/alerts/example",
  properties: {
    event: "Severe Thunderstorm Warning",
    headline: "Severe Thunderstorm Warning including Eau Claire WI",
    severity: "Severe",
    certainty: "Observed",
    urgency: "Immediate",
    areaDesc: "Eau Claire County",
    description: "Damaging wind and hail are occurring.",
    expires: "2026-09-07T03:00:00Z"
  }
});

describe("weather demand intelligence", () => {
  it("normalizes damage-relevant NWS alerts", () => {
    expect(alert).not.toBeNull();
    expect(alert?.serviceRelevanceScore).toBeGreaterThanOrEqual(80);
  });

  it("rejects unrelated weather products", () => {
    expect(normalizeNwsAlert({ id: "x", properties: { event: "Dense Fog Advisory" } })).toBeNull();
  });

  it("keeps weather and demand claims separate until tenant leads corroborate the signal", () => {
    const weatherOnly = classifyWeatherDemand({ alert: alert!, recentStormLeads: 1, baselineDailyStormLeads: 0.4 });
    expect(weatherOnly.signalStatus).toBe("weather_only");
    expect(weatherOnly.evidence.claimAllowed).toBe("severe_weather_opportunity_only");

    const corroborated = classifyWeatherDemand({ alert: alert!, recentStormLeads: 4, baselineDailyStormLeads: 1 });
    expect(corroborated.signalStatus).toBe("demand_corroborated");
    expect(corroborated.evidence.claimAllowed).toBe("storm_related_demand_is_rising");
  });

  it("supports city or named-area matching for state-scoped alert fallbacks", () => {
    expect(alertMatchesTextServiceArea("Eau Claire County; Chippewa County", "Eau Claire", "Chippewa Valley")).toBe(true);
    expect(alertMatchesTextServiceArea("Dane County", "Eau Claire", "Chippewa Valley")).toBe(false);
  });
});

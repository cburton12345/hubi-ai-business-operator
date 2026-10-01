import type { Config } from "@netlify/functions";
import { runWeatherDemandMonitor } from "../../src/lib/growth/run-weather-demand-monitor";

function boundedInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

export default async function runWeatherDemandMonitorBackground(request: Request) {
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token || supplied !== token) return new Response("Unauthorized", { status: 401 });

  const result = await runWeatherDemandMonitor({
    locationLimit: boundedInt(Netlify.env.get("WEATHER_SIGNAL_LOCATION_BATCH_SIZE"), 100, 500),
    concurrency: boundedInt(Netlify.env.get("WEATHER_SIGNAL_CONCURRENCY"), 3, 6)
  });
  console.log("Weather demand monitor completed", result);
  return new Response(null, { status: 204 });
}

export const config: Config = {
  background: true
};

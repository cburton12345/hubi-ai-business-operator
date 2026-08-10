import { getFreshProviderAccessToken } from "@/lib/integrations/provider-access-token";
import { GoogleCalendarProvider } from "./google-calendar";
import { MicrosoftCalendarProvider } from "./microsoft-calendar";
import type { CalendarProviderKey } from "./types";

export async function createCalendarProvider(tenantId: string, provider: CalendarProviderKey, fetchImpl: typeof fetch = fetch) {
  const accessToken = await getFreshProviderAccessToken(tenantId, provider, fetchImpl);
  return provider === "google_calendar"
    ? new GoogleCalendarProvider(accessToken, fetchImpl)
    : new MicrosoftCalendarProvider(accessToken, fetchImpl);
}

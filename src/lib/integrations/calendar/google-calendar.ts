import type { CalendarChangePage, CalendarProvider, CalendarWriteInput, ExternalCalendar, ExternalCalendarEvent } from "./types";

type GoogleEvent = Record<string, unknown> & {
  id?: string; etag?: string; status?: string; summary?: string; description?: string; location?: string;
  updated?: string; htmlLink?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string }>;
};

function event(value: GoogleEvent): ExternalCalendarEvent {
  const allDay = Boolean(value.start?.date && !value.start?.dateTime);
  return {
    id: String(value.id ?? ""), version: value.etag ? String(value.etag) : null,
    status: value.status === "cancelled" || value.status === "tentative" ? value.status : "confirmed",
    title: String(value.summary ?? ""), description: String(value.description ?? ""), location: String(value.location ?? ""),
    startsAt: value.start?.dateTime ?? (value.start?.date ? `${value.start.date}T00:00:00.000Z` : null),
    endsAt: value.end?.dateTime ?? (value.end?.date ? `${value.end.date}T00:00:00.000Z` : null), allDay,
    updatedAt: value.updated ?? null, attendeeEmails: (value.attendees ?? []).map((item) => item.email ?? "").filter(Boolean),
    webUrl: value.htmlLink ?? null
  };
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly key = "google_calendar" as const;
  constructor(private readonly accessToken: string, private readonly fetchImpl: typeof fetch = fetch) {}
  private async json(url: string, init?: RequestInit) {
    const response = await this.fetchImpl(url, { ...init, headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(`Google Calendar returned HTTP ${response.status}.`), { status: response.status, body });
    return body as Record<string, unknown>;
  }
  async listCalendars(): Promise<ExternalCalendar[]> {
    const calendars: ExternalCalendar[] = [];
    let pageToken: string | null = null;
    do {
      const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const body = await this.json(url.toString()) as { items?: Array<Record<string, unknown>>; nextPageToken?: string };
      calendars.push(...(body.items ?? []).map((item) => ({ id: String(item.id), name: String(item.summary ?? item.id), primary: item.primary === true, writable: ["owner", "writer"].includes(String(item.accessRole)), timeZone: item.timeZone ? String(item.timeZone) : null })));
      pageToken = body.nextPageToken ?? null;
    } while (pageToken);
    return calendars;
  }
  async listChanges(input: { calendarId: string; cursor?: string | null; windowStart: string; windowEnd: string }): Promise<CalendarChangePage> {
    const events: ExternalCalendarEvent[] = [];
    let pageToken: string | null = null;
    let nextCursor: string | null = null;
    do {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`);
      url.searchParams.set("singleEvents", "true"); url.searchParams.set("showDeleted", "true"); url.searchParams.set("maxResults", "2500");
      if (input.cursor) url.searchParams.set("syncToken", input.cursor);
      else { url.searchParams.set("timeMin", input.windowStart); url.searchParams.set("timeMax", input.windowEnd); }
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      try {
        const body = await this.json(url.toString()) as { items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string };
        events.push(...(body.items ?? []).filter((item) => item.id).map(event));
        pageToken = body.nextPageToken ?? null; nextCursor = body.nextSyncToken ?? nextCursor;
      } catch (error) {
        if ((error as { status?: number }).status === 410) return { events: [], nextCursor: null, resetRequired: true };
        throw error;
      }
    } while (pageToken);
    return { events, nextCursor, resetRequired: false };
  }
  async upsertEvent(calendarId: string, input: CalendarWriteInput) {
    const url = input.externalId
      ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.externalId)}`
      : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const body = await this.json(url, { method: input.externalId ? "PATCH" : "POST", body: JSON.stringify({ summary: input.title, description: input.description, location: input.location, start: { dateTime: input.startsAt, timeZone: input.timeZone }, end: { dateTime: input.endsAt, timeZone: input.timeZone }, attendees: (input.attendeeEmails ?? []).map((email) => ({ email })), extendedProperties: { private: { ferocityOperationKey: input.idempotencyKey } } }) });
    return event(body as GoogleEvent);
  }
  async deleteEvent(calendarId: string, externalId: string) {
    const response = await this.fetchImpl(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalId)}`, { method: "DELETE", headers: { authorization: `Bearer ${this.accessToken}` }, cache: "no-store" });
    if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Google Calendar delete returned HTTP ${response.status}.`);
  }
}

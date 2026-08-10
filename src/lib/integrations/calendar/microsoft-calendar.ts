import type { CalendarChangePage, CalendarProvider, CalendarWriteInput, ExternalCalendar, ExternalCalendarEvent } from "./types";

type GraphEvent = {
  id?: string; changeKey?: string; subject?: string; bodyPreview?: string; isAllDay?: boolean; isCancelled?: boolean;
  lastModifiedDateTime?: string; webLink?: string; location?: { displayName?: string };
  start?: { dateTime?: string; timeZone?: string }; end?: { dateTime?: string; timeZone?: string };
  attendees?: Array<{ emailAddress?: { address?: string } }>; "@removed"?: unknown;
};

function utc(value?: string) {
  if (!value) return null;
  return /z$|[+-]\d\d:\d\d$/i.test(value) ? value : `${value}Z`;
}

function event(value: GraphEvent): ExternalCalendarEvent {
  return {
    id: String(value.id ?? ""), version: value.changeKey ?? null,
    status: value.isCancelled || value["@removed"] ? "cancelled" : "confirmed",
    title: value.subject ?? "", description: value.bodyPreview ?? "", location: value.location?.displayName ?? "",
    startsAt: utc(value.start?.dateTime), endsAt: utc(value.end?.dateTime), allDay: value.isAllDay === true,
    updatedAt: value.lastModifiedDateTime ?? null,
    attendeeEmails: (value.attendees ?? []).map((item) => item.emailAddress?.address ?? "").filter(Boolean),
    webUrl: value.webLink ?? null
  };
}

export class MicrosoftCalendarProvider implements CalendarProvider {
  readonly key = "microsoft_calendar" as const;
  constructor(private readonly accessToken: string, private readonly fetchImpl: typeof fetch = fetch) {}
  private async json(url: string, init?: RequestInit) {
    const response = await this.fetchImpl(url, { ...init, headers: { authorization: `Bearer ${this.accessToken}`, "content-type": "application/json", Prefer: 'outlook.timezone="UTC"', ...(init?.headers ?? {}) }, cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(`Microsoft Graph returned HTTP ${response.status}.`), { status: response.status, body });
    return body as Record<string, unknown>;
  }
  async listCalendars(): Promise<ExternalCalendar[]> {
    const calendars: ExternalCalendar[] = [];
    let url: string | null = "https://graph.microsoft.com/v1.0/me/calendars?$select=id,name,canEdit,isDefaultCalendar";
    while (url) {
      const body = await this.json(url) as { value?: Array<Record<string, unknown>>; "@odata.nextLink"?: string };
      calendars.push(...(body.value ?? []).map((item) => ({ id: String(item.id), name: String(item.name ?? item.id), primary: item.isDefaultCalendar === true, writable: item.canEdit !== false, timeZone: null })));
      url = body["@odata.nextLink"] ?? null;
    }
    return calendars;
  }
  async listChanges(input: { calendarId: string; cursor?: string | null; windowStart: string; windowEnd: string }): Promise<CalendarChangePage> {
    const events: ExternalCalendarEvent[] = [];
    let url: string | null = input.cursor || `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(input.calendarId)}/calendarView/delta?startDateTime=${encodeURIComponent(input.windowStart)}&endDateTime=${encodeURIComponent(input.windowEnd)}`;
    let nextCursor: string | null = null;
    while (url) {
      const body = await this.json(url) as { value?: GraphEvent[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };
      events.push(...(body.value ?? []).filter((item) => item.id).map(event));
      url = body["@odata.nextLink"] ?? null; nextCursor = body["@odata.deltaLink"] ?? nextCursor;
    }
    return { events, nextCursor, resetRequired: false };
  }
  async upsertEvent(calendarId: string, input: CalendarWriteInput) {
    const url = input.externalId
      ? `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.externalId)}`
      : `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events`;
    const body = await this.json(url, { method: input.externalId ? "PATCH" : "POST", body: JSON.stringify({ subject: input.title, body: { contentType: "text", content: input.description ?? "" }, location: { displayName: input.location ?? "" }, start: { dateTime: input.startsAt, timeZone: input.timeZone ?? "UTC" }, end: { dateTime: input.endsAt, timeZone: input.timeZone ?? "UTC" }, attendees: (input.attendeeEmails ?? []).map((address) => ({ emailAddress: { address }, type: "required" })), transactionId: input.idempotencyKey }) });
    return event(body as GraphEvent);
  }
  async deleteEvent(calendarId: string, externalId: string) {
    const response = await this.fetchImpl(`https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalId)}`, { method: "DELETE", headers: { authorization: `Bearer ${this.accessToken}` }, cache: "no-store" });
    if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Microsoft Calendar delete returned HTTP ${response.status}.`);
  }
}

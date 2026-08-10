export type CalendarProviderKey = "google_calendar" | "microsoft_calendar";

export type ExternalCalendar = {
  id: string;
  name: string;
  primary: boolean;
  writable: boolean;
  timeZone: string | null;
};

export type ExternalCalendarEvent = {
  id: string;
  version: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  title: string;
  description: string;
  location: string;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  updatedAt: string | null;
  attendeeEmails: string[];
  webUrl: string | null;
};

export type CalendarChangePage = {
  events: ExternalCalendarEvent[];
  nextCursor: string | null;
  resetRequired: boolean;
};

export type CalendarWriteInput = {
  externalId?: string | null;
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  timeZone?: string;
  attendeeEmails?: string[];
  idempotencyKey: string;
};

export interface CalendarProvider {
  readonly key: CalendarProviderKey;
  listCalendars(): Promise<ExternalCalendar[]>;
  listChanges(input: { calendarId: string; cursor?: string | null; windowStart: string; windowEnd: string }): Promise<CalendarChangePage>;
  upsertEvent(calendarId: string, input: CalendarWriteInput): Promise<ExternalCalendarEvent>;
  deleteEvent(calendarId: string, externalId: string): Promise<void>;
}

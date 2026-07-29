export type CalendarVisit = {
  id: string;
  title: string;
  customerName?: string | null;
  address?: string | null;
  assignedWorkers?: string | null;
  scheduledStart: string | Date;
  scheduledEnd?: string | Date | null;
  updatedAt?: string | Date | null;
  status?: string | null;
};

function escapeText(value: string | null | undefined) {
  return (value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function calendarDate(value: string | Date) {
  return new Date(value).toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
}

function foldLine(value: string) {
  const chunks: string[] = [];
  let remaining = value;
  while (remaining.length > 74) {
    chunks.push(remaining.slice(0, 74));
    remaining = ` ${remaining.slice(74)}`;
  }
  chunks.push(remaining);
  return chunks.join("\r\n");
}

export function buildICalendar(visits: CalendarVisit[], calendarName = "Ferocity Schedule") {
  const generatedAt = new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ferocity//Service Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "X-PUBLISHED-TTL:PT15M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M"
  ];

  for (const visit of visits) {
    const start = new Date(visit.scheduledStart);
    if (Number.isNaN(start.getTime())) continue;
    const fallbackEnd = new Date(start.getTime() + 60 * 60 * 1000);
    const end = visit.scheduledEnd ? new Date(visit.scheduledEnd) : fallbackEnd;
    const description = [
      visit.customerName ? `Customer: ${visit.customerName}` : "",
      visit.assignedWorkers ? `Team: ${visit.assignedWorkers}` : "",
      visit.status ? `Status: ${visit.status.replaceAll("_", " ")}` : ""
    ].filter(Boolean).join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:visit-${visit.id}@ferocity.live`,
      `DTSTAMP:${calendarDate(visit.updatedAt ?? generatedAt)}`,
      `DTSTART:${calendarDate(start)}`,
      `DTEND:${calendarDate(Number.isNaN(end.getTime()) ? fallbackEnd : end)}`,
      `SUMMARY:${escapeText(visit.title)}`,
      `DESCRIPTION:${escapeText(description)}`,
      `LOCATION:${escapeText(visit.address)}`,
      `STATUS:${visit.status === "canceled" ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

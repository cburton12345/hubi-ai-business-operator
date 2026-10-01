export const scheduledMessageModes = ["now", "tomorrow_morning", "next_business_morning", "custom"] as const;

export type ScheduledMessageMode = (typeof scheduledMessageModes)[number];

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number };

function partsInZone(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
}

function serial(parts: LocalParts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

function localParts(value: string): LocalParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const parsed = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]) };
  const check = new Date(serial(parsed));
  if (check.getUTCFullYear() !== parsed.year || check.getUTCMonth() + 1 !== parsed.month || check.getUTCDate() !== parsed.day
    || parsed.hour > 23 || parsed.minute > 59) return null;
  return parsed;
}

export function zonedLocalToDate(value: string, timeZone: string): Date | null {
  const desired = localParts(value);
  if (!desired) return null;
  try {
    let candidate = new Date(serial(desired));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const seen = partsInZone(candidate, timeZone);
      candidate = new Date(candidate.getTime() + serial(desired) - serial(seen));
    }
    const finalParts = partsInZone(candidate, timeZone);
    return serial(finalParts) === serial(desired) ? candidate : null;
  } catch {
    return null;
  }
}

function localDateString(parts: LocalParts, daysToAdd: number, hour = 8, minute = 30) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + daysToAdd, hour, minute));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function resolveScheduledMessageTime(input: {
  mode: ScheduledMessageMode;
  customLocal?: string;
  timeZone: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.mode === "now") return now;
  const today = partsInZone(now, input.timeZone);
  if (input.mode === "tomorrow_morning") return zonedLocalToDate(localDateString(today, 1), input.timeZone);
  if (input.mode === "next_business_morning") {
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone, weekday: "short" }).format(now);
    const days = weekday === "Fri" ? 3 : weekday === "Sat" ? 2 : 1;
    return zonedLocalToDate(localDateString(today, days), input.timeZone);
  }
  return input.customLocal ? zonedLocalToDate(input.customLocal, input.timeZone) : null;
}

export function scheduledTimeIsAllowed(value: Date | null, now = new Date()) {
  return Boolean(value && Number.isFinite(value.getTime()) && value.getTime() >= now.getTime() - 60_000
    && value.getTime() <= now.getTime() + 366 * 24 * 60 * 60_000);
}

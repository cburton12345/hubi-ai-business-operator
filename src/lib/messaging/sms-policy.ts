const gsmBasic = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
);
const gsmExtended = new Set("^{}\\[~]|€");

export type SmsPurpose = "transactional" | "service" | "review" | "marketing" | "security" | "compliance";

export function normalizeSmsKeyword(body: string) {
  return body.trim().toUpperCase().replace(/[.!?,;:]+$/g, "").replace(/[\s_-]+/g, " ");
}

const stopKeywords = new Set([
  "STOP", "STOP ALL", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPT OUT", "OPTOUT"
]);

export function classifySmsKeyword(body: string): "stop" | "help" | null {
  const keyword = normalizeSmsKeyword(body);
  if (stopKeywords.has(keyword)) return "stop";
  if (keyword === "HELP" || keyword === "INFO" || keyword === "SUPPORT") return "help";
  return null;
}

export function estimateSmsSegments(body: string) {
  let septets = 0;
  let gsm = true;
  for (const character of body) {
    if (gsmBasic.has(character)) septets += 1;
    else if (gsmExtended.has(character)) septets += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) return { encoding: "gsm7" as const, units: septets <= 160 ? 1 : Math.ceil(septets / 153), characters: [...body].length };

  const codeUnits = body.length;
  return { encoding: "ucs2" as const, units: codeUnits <= 70 ? 1 : Math.ceil(codeUnits / 67), characters: [...body].length };
}

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function isWithinQuietHours(localTime: string, start: string, end: string) {
  const current = minutes(localTime);
  const from = minutes(start);
  const to = minutes(end);
  if (current === null || from === null || to === null || from === to) return false;
  return from < to ? current >= from && current < to : current >= from || current < to;
}

export function localTimeInZone(now: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now);
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    return hour && minute ? `${hour}:${minute}` : null;
  } catch {
    return null;
  }
}

export function smsPurpose(value: unknown): SmsPurpose {
  return ["transactional", "service", "review", "marketing", "security", "compliance"].includes(String(value))
    ? String(value) as SmsPurpose
    : "service";
}

export function inferSmsPurpose(workflowType: string | null | undefined): SmsPurpose {
  const value = String(workflowType ?? "").toLowerCase();
  if (/(campaign|promotion|reactivation|marketing|referral)/.test(value)) return "marketing";
  if (/review/.test(value)) return "review";
  if (/(invoice|estimate|appointment|schedule|payment|collection)/.test(value)) return "transactional";
  return "service";
}

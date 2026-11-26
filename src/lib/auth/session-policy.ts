export const trustedSessionDays = 90;
export const trustedSessionAbsoluteDays = 365;
export const trustedSessionRenewalWindowDays = 30;
export const trustedSessionActivityThrottleHours = 12;

export const trustedSessionMaxAgeSeconds = trustedSessionDays * 24 * 60 * 60;

export function sessionCookieOptions(maxAge = trustedSessionMaxAgeSeconds) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(0, Math.floor(maxAge)),
    priority: "high" as const,
  };
}

export function boundedUserAgent(value: string | null | undefined) {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]/g, " ").trim() ?? "";
  return normalized ? normalized.slice(0, 512) : null;
}

export function trustedDeviceLabel(userAgent: string | null | undefined) {
  const value = boundedUserAgent(userAgent)?.toLowerCase() ?? "";
  const platform = /iphone/.test(value)
    ? "iPhone"
    : /ipad/.test(value)
      ? "iPad"
      : /android/.test(value)
        ? "Android"
        : /windows/.test(value)
          ? "Windows"
          : /macintosh|mac os x/.test(value)
            ? "Mac"
            : /linux/.test(value)
              ? "Linux"
              : "device";
  const browser = /edg\//.test(value)
    ? "Edge"
    : /firefox\//.test(value)
      ? "Firefox"
      : /crios\//.test(value)
        ? "Chrome"
        : /chrome\//.test(value)
          ? "Chrome"
          : /safari\//.test(value)
            ? "Safari"
            : "Ferocity";
  return `${browser} on ${platform}`.slice(0, 120);
}

export function secondsUntil(date: Date, now = new Date()) {
  return Math.max(0, Math.floor((date.getTime() - now.getTime()) / 1000));
}

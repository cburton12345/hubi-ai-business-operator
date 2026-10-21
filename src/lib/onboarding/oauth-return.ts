export function onboardingOAuthStartPath(
  oauthStartPath: string,
  input: { provider: string; destination?: "ferocity" | "calendar" | "email" },
) {
  const destination = input.destination ?? "ferocity";
  const returnPath = destination === "calendar"
    ? "/app/integrations/calendar?onboarding=1"
    : destination === "email"
      ? "/app/ferocity?onboarding=1&command=Review the newly connected inbox, summarize what you discovered about this business, identify the highest-value safe first action, and carry it through if already authorized."
      : `/app/ferocity?onboarding=1&command=${encodeURIComponent(`Review the newly connected ${input.provider.replaceAll("_", " ")} account, summarize what Ferocity discovered, and complete the highest-value safe first action that is already authorized.`)}`;
  const separator = oauthStartPath.includes("?") ? "&" : "?";
  return `${oauthStartPath}${separator}returnTo=${encodeURIComponent(returnPath)}`;
}

export function normalizeOAuthReturnTo(value: string | null | undefined) {
  if (!value || value.length > 500 || value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return "/app/integrations";
  }
  try {
    const parsed = new URL(value, "https://ferocity.invalid");
    if (parsed.origin !== "https://ferocity.invalid") return "/app/integrations";
    if (parsed.pathname !== "/app" && !parsed.pathname.startsWith("/app/")) return "/app/integrations";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/app/integrations";
  }
}

export function oauthAppRedirect(
  request: Request,
  params: Record<string, string>,
  returnTo?: string | null,
) {
  const url = new URL(normalizeOAuthReturnTo(returnTo), request.url);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return Response.redirect(url, 307);
}

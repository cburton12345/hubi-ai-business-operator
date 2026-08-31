const allowedRoots = ["/app", "/employee"] as const;

export function safePostLoginDestination(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/app";
  const path = value.split("?")[0].split("#")[0];
  return allowedRoots.some((root) => path === root || path.startsWith(`${root}/`)) ? value : "/app";
}


import { NextRequest, NextResponse } from "next/server";

export function absoluteAppUrl(path: string) {
  const configured = process.env.FEROCITY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://ferocity.live";
  const origin = /^https?:\/\//i.test(configured) ? new URL(configured).origin : "https://ferocity.live";
  const safePath = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return new URL(safePath, origin).toString();
}

export function safeRedirect(request: NextRequest, path: string, status = 303) {
  const configured = process.env.FEROCITY_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  const origin =
    configured && /^https?:\/\//i.test(configured)
      ? new URL(configured).origin
      : request.nextUrl.origin;
  if (!path.startsWith("/") || path.startsWith("//")) {
    path = "/";
  }
  return NextResponse.redirect(new URL(path, origin), status);
}

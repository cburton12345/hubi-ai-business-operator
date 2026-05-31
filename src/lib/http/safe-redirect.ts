import { NextRequest, NextResponse } from "next/server";

export function safeRedirect(request: NextRequest, path: string, status = 303) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const protocol = forwardedProto || request.nextUrl.protocol.replace(":", "") || "https";
  const origin = `${protocol}://${host}`;

  return NextResponse.redirect(new URL(path, origin), status);
}

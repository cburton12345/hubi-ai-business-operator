import { NextResponse, type NextRequest } from "next/server";

const adminCookieName = "ferocity_admin_session";
const appSessionCookieName = "ferocity_app_session";

export function middleware(request: NextRequest) {
  const token = process.env.ADMIN_ACCESS_TOKEN;
  const isProduction = process.env.NODE_ENV === "production";

  if (request.nextUrl.pathname === "/app/tenants" || request.nextUrl.pathname.startsWith("/app/tenant/")) {
    const workspaceUrl = new URL(request.url);
    workspaceUrl.pathname =
      request.nextUrl.pathname === "/app/tenants"
        ? "/app/workspaces"
        : request.nextUrl.pathname.replace(/^\/app\/tenant/, "/app/workspace");
    return NextResponse.redirect(workspaceUrl);
  }

  if (!request.nextUrl.pathname.startsWith("/app")) {
    return NextResponse.next();
  }

  const queryToken = request.nextUrl.searchParams.get("adminToken");

  if (token && queryToken && queryToken === token) {
    const cleanUrl = new URL(request.url);
    cleanUrl.searchParams.delete("adminToken");

    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set(adminCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      maxAge: 60 * 60 * 12
    });
    return response;
  }

  if (
    request.cookies.get(appSessionCookieName)?.value ||
    (token && request.cookies.get(adminCookieName)?.value === token)
  ) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/app/:path*"]
};

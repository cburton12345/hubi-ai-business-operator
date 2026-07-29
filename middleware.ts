import { NextResponse, type NextRequest } from "next/server";

const adminCookieName = "ferocity_admin_session";
const appSessionCookieName = "ferocity_app_session";

async function adminCookieValue(token: string) {
  const bytes = new TextEncoder().encode(`ferocity-admin-session:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function middleware(request: NextRequest) {
  const token = process.env.ADMIN_ACCESS_TOKEN;
  const appPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

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

  const adminCookie = request.cookies.get(adminCookieName)?.value;
  const validAdminCookie = Boolean(token && adminCookie && adminCookie === (await adminCookieValue(token)));
  if (
    request.cookies.get(appSessionCookieName)?.value ||
    validAdminCookie
  ) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-ferocity-app-path", appPath);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", appPath);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/app/:path*"]
};

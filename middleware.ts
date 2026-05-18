import { NextResponse, type NextRequest } from "next/server";

const adminCookieName = "hubi_admin_session";

export function middleware(request: NextRequest) {
  const token = process.env.ADMIN_ACCESS_TOKEN;
  const isProduction = process.env.NODE_ENV === "production";

  if (!request.nextUrl.pathname.startsWith("/app")) {
    return NextResponse.next();
  }

  if (!token && !isProduction) {
    return NextResponse.next();
  }

  if (!token) {
    return new NextResponse("Admin access is not configured.", { status: 503 });
  }

  if (request.cookies.get(adminCookieName)?.value === token) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/app/:path*"]
};

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "marketplacepro",
    status: "management_authentication_required",
    message: "Connection, account-mapping, and pilot-enrollment details are available only through authenticated owner management surfaces.",
  });
}

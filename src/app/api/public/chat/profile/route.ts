import { NextResponse } from "next/server";
import { getFerocityPublicSalesProfile } from "@/lib/forms/get-public-form-profile";

export async function GET() {
  const profile = await getFerocityPublicSalesProfile();
  if (!profile) return NextResponse.json({ error: "Ask Ferocity is unavailable." }, { status: 404 });

  return NextResponse.json({
    publicKey: profile.publicKey,
    brandName: profile.brandName
  });
}

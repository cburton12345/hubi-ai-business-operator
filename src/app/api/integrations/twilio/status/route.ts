import { NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { resolveTwilioSmsConfiguration } from "@/lib/messaging/twilio-tenant-config";
import { handleTwilioMessagingWebhook } from "@/lib/messaging/twilio-webhook";

export async function GET() {
  const tenantId = await getCurrentWorkspaceId();
  const configuration = await resolveTwilioSmsConfiguration(tenantId, false);
  return NextResponse.json({
    provider: "twilio",
    configured: Boolean(configuration),
    ownershipMode: configuration?.ownershipMode ?? null,
    fromNumber: configuration?.fromNumber ?? null,
    webhookPath: "/api/messaging/webhooks/twilio",
    liveActionsEnabled: Boolean(await resolveTwilioSmsConfiguration(tenantId, true)),
    secretsExposed: false
  });
}

export async function POST(request: Request) {
  // Backward-compatible status callback. New Twilio configurations should use
  // /api/messaging/webhooks/twilio for both inbound messages and delivery status.
  return handleTwilioMessagingWebhook(request);
}

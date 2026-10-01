import { handleStandardOAuthCallback } from "@/lib/integrations/complete-standard-oauth";

export async function GET(request: Request) {
  return handleStandardOAuthCallback(request, [
    "google_business_profile",
    "google_ads",
    "youtube",
    "search_console",
    "analytics",
    "google_calendar",
    "gmail_mailbox"
  ]);
}

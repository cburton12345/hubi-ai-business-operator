import { createClient } from "@supabase/supabase-js";
import { env, hasSupabaseBrowserConfig } from "@/lib/env";

export function createBrowserSupabaseClient() {
  if (!hasSupabaseBrowserConfig()) {
    return null;
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
}

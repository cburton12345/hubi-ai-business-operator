import { createClient } from "@supabase/supabase-js";
import { env, hasSupabaseAdminConfig, hasSupabaseBrowserConfig } from "@/lib/env";

export type SupabaseAuthIdentity = {
  authUserId: string;
  email: string;
};

function createSupabasePasswordClient() {
  if (!hasSupabaseBrowserConfig()) return null;

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function createSupabaseAuthAdminClient() {
  if (!hasSupabaseAdminConfig()) return null;

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export async function signInWithSupabasePassword(email: string, password: string): Promise<SupabaseAuthIdentity | null> {
  const supabase = createSupabasePasswordClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error || !data.user?.id || !data.user.email) {
    return null;
  }

  await supabase.auth.signOut();

  return {
    authUserId: data.user.id,
    email: data.user.email
  };
}

export async function ensureSupabaseAuthUser(input: {
  email: string;
  password: string;
  name?: string | null;
}): Promise<SupabaseAuthIdentity | null> {
  const supabase = createSupabaseAuthAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email.toLowerCase(),
    password: input.password,
    email_confirm: true,
    user_metadata: {
      name: input.name ?? undefined
    }
  });

  if (!error && data.user?.id && data.user.email) {
    return {
      authUserId: data.user.id,
      email: data.user.email
    };
  }

  const signedIn = await signInWithSupabasePassword(input.email, input.password);
  if (signedIn) {
    return signedIn;
  }

  return null;
}

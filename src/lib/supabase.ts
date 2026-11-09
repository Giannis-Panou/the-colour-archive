import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const key: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Without both values the app runs in browser-only mode and hides sign-in. */
export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, {
    auth: {
      // PKCE puts the sign-in code in ?code=, which keeps #s= and #share= links free for sharing.
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  : null;

/** True when this browser has a saved Supabase session, so the first render can wait for the cloud archive. */
export function hasStoredSession(): boolean {
  if (!supabase) return false;
  try {
    return Object.keys(localStorage).some((name) => /^sb-.+-auth-token$/.test(name));
  } catch {
    return false;
  }
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error("Accounts aren't set up on this copy of the app.");
  return supabase;
}

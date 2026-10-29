import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client — for use in "use client" components (the
 * login/register forms, any client-side auth state reads). Reads the two
 * public env vars; see .env.local.example for what to set once a Supabase
 * project exists.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

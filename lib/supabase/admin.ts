import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — full admin access, bypasses RLS entirely. Only
 * ever import this from server-only code (Route Handlers), never from a
 * "use client" component; SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_
 * prefix so Next won't bundle it to the browser, but don't rely on that
 * alone — keep this import server-side on purpose.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

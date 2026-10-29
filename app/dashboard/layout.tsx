import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/is-configured";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";

/**
 * Shared shell for every /dashboard/* route — one auth check here instead
 * of repeating it per page. `proxy.ts` already redirects signed-out
 * visitors before this even renders (it matches everything under
 * `/dashboard`), but this is the real guard: proxy is a fast-path
 * optimization, not the source of truth for auth.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f5f4] px-6">
        <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-10 text-center shadow-[0_30px_70px_-25px_rgba(0,0,0,0.15)]">
          <span className="text-xs font-medium uppercase tracking-[0.3em] text-amber-600">
            AutoMod AI
          </span>
          <h1 className="font-display mt-3 text-2xl font-semibold tracking-tight text-neutral-900">
            Supabase isn&apos;t connected yet.
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Add your project URL and anon key to .env.local to bring this to
            life.
          </p>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userLabel = user.user_metadata.full_name || user.email || "Account";

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f5f4] md:flex-row">
      <DashboardSidebar userLabel={userLabel} />
      <main className="flex-1 px-4 py-8 sm:px-8 md:px-10">{children}</main>
    </div>
  );
}

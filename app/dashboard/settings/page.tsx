import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import EditProfileForm from "@/components/dashboard/settings/EditProfileForm";
import DeleteAccountSection from "@/components/dashboard/settings/DeleteAccountSection";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The layout above already redirects signed-out visitors — this is a
  // type-narrowing guard, not the actual auth boundary.
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const currentName = profile?.full_name || user.user_metadata.full_name || "";

  return (
    <div>
      <DashboardPageHeader title="Settings" description="Account details and preferences." />

      <div className="flex max-w-xl flex-col gap-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-neutral-900">Profile</h2>
          <div className="mt-4">
            <EditProfileForm userId={user.id} initialName={currentName} email={user.email ?? ""} />
          </div>
        </div>

        <DeleteAccountSection />
      </div>
    </div>
  );
}

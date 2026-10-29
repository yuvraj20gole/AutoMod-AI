import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Deleting the auth user cascades to `profiles`/`cars`/`builds` rows for
 * free — they're all `references auth.users(id) on delete cascade`. Storage
 * objects are NOT covered by that cascade (they're not a Postgres FK to
 * auth.users), so a deleted user's photos would otherwise sit orphaned in
 * the bucket forever, permanently inaccessible since RLS keys off a uid
 * that no longer exists. Remove those explicitly, before the user goes.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: cars, error: carsError } = await admin
    .from("cars")
    .select("photo_url")
    .eq("user_id", user.id);

  if (carsError) {
    return NextResponse.json({ error: carsError.message }, { status: 500 });
  }

  const photoPaths = (cars ?? [])
    .map((c) => c.photo_url as string | null)
    .filter((p): p is string => Boolean(p));

  if (photoPaths.length > 0) {
    const { error: storageError } = await admin.storage.from("car-photos").remove(photoPaths);
    if (storageError) {
      return NextResponse.json({ error: storageError.message }, { status: 500 });
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

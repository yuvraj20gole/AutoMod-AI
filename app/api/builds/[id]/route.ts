import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ownedBuildStoragePaths } from "@/lib/builds/paths";

/** DELETE /api/builds/[id] — remove build row + stored before/after images. */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: build, error: loadError } = await supabase
    .from("builds")
    .select("id, user_id, before_image_url, after_image_url")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  if (!build || build.user_id !== user.id) {
    return NextResponse.json({ error: "Build not found" }, { status: 404 });
  }

  const paths = ownedBuildStoragePaths(
    user.id,
    build.before_image_url,
    build.after_image_url
  );
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from("car-photos").remove(paths);
    if (storageError && storageError.message !== "Object not found") {
      return NextResponse.json({ error: storageError.message }, { status: 500 });
    }
  }

  const { error: deleteError } = await supabase.from("builds").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

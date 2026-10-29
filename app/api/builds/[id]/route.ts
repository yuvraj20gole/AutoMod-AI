import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deletableBuildStoragePaths } from "@/lib/builds/paths";

/**
 * DELETE /api/builds/[id] — remove the build row and any storage objects that
 * belong ONLY to this build.
 *
 * `before_image_url` is usually the car's original photo (shared). Never delete
 * car originals, paths other builds still reference, or anything by prefix.
 * Storage failures are logged; the row delete still proceeds.
 */
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

  // Paths still held by every OTHER build for this user (exact object keys).
  const { data: siblings, error: siblingsError } = await supabase
    .from("builds")
    .select("before_image_url, after_image_url")
    .eq("user_id", user.id)
    .neq("id", id);

  if (siblingsError) {
    console.error("[builds DELETE] could not load sibling paths:", siblingsError.message);
  }

  const referencedByOthers: string[] = [];
  for (const row of siblings ?? []) {
    if (row.before_image_url) referencedByOthers.push(row.before_image_url);
    if (row.after_image_url) referencedByOthers.push(row.after_image_url);
  }

  const paths = deletableBuildStoragePaths({
    userId: user.id,
    beforePath: build.before_image_url,
    afterPath: build.after_image_url,
    referencedByOthers,
  });

  if (paths.length > 0) {
    try {
      const { error: storageError } = await supabase.storage.from("car-photos").remove(paths);
      if (storageError && storageError.message !== "Object not found") {
        // Keep the files; never fail the request over storage.
        console.error(
          "[builds DELETE] storage remove failed (keeping files):",
          storageError.message,
          { buildId: id, paths }
        );
      }
    } catch (err) {
      console.error("[builds DELETE] storage remove threw (keeping files):", err, {
        buildId: id,
        paths,
      });
    }
  }

  const { error: deleteError } = await supabase.from("builds").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

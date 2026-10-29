"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ANGLES, ANGLE_LABEL, type PhotoAngle } from "@/lib/angles";
import { detectPhoto } from "@/lib/detect";

export type ManagedPhoto = { id: string; angle: PhotoAngle; path: string; url: string };

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export default function CarPhotosManager({
  carId,
  carName,
  photos,
  onClose,
}: {
  carId: string;
  carName: string;
  photos: ManagedPhoto[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<PhotoAngle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function syncPrimary(supabase: ReturnType<typeof createClient>) {
    const { data } = await supabase.from("car_photos").select("angle, storage_path").eq("car_id", carId);
    const rows = data ?? [];
    const primary = rows.find((r) => r.angle === "front_34") ?? rows[0];
    await supabase.from("cars").update({ photo_url: primary?.storage_path ?? null }).eq("id", carId);
  }

  async function upload(angle: PhotoAngle, file: File) {
    setError(null);
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Photo must be under 5MB.");
      return;
    }
    setBusy(angle);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Your session expired. Refresh and log in again.");
      setBusy(null);
      return;
    }
    const existing = photos.find((p) => p.angle === angle);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("car-photos").upload(path, file, { contentType: file.type });
    if (upErr) {
      setError(upErr.message);
      setBusy(null);
      return;
    }
    if (existing) await supabase.from("car_photos").delete().eq("id", existing.id);
    const { error: insErr } = await supabase
      .from("car_photos")
      .insert({ car_id: carId, user_id: user.id, angle, storage_path: path });
    if (insErr) {
      await supabase.storage.from("car-photos").remove([path]);
      setError(insErr.message);
      setBusy(null);
      return;
    }
    if (existing) await supabase.storage.from("car-photos").remove([existing.path]);
    await syncPrimary(supabase);
    setBusy(null);
    router.refresh();
  }

  async function addMany(files: File[]) {
    setError(null);
    setNote(null);
    const notes: string[] = [];
    for (const f of files) {
      const r = await detectPhoto(f);
      if ("error" in r || !r.angle) {
        notes.push(`${f.name}: could not detect the angle, add it in a slot below.`);
        continue;
      }
      await upload(r.angle, f);
      notes.push(`${f.name} added as ${ANGLE_LABEL[r.angle]}.`);
    }
    setNote(notes.join(" "));
  }

  async function remove(photo: ManagedPhoto) {
    setError(null);
    setBusy(photo.angle);
    const supabase = createClient();
    const { error: delErr } = await supabase.from("car_photos").delete().eq("id", photo.id);
    if (delErr) {
      setError(delErr.message);
      setBusy(null);
      return;
    }
    await supabase.storage.from("car-photos").remove([photo.path]);
    await syncPrimary(supabase);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.3)] sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight text-neutral-900">Photos: {carName}</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Select several photos at once and each one is sorted into its angle automatically. You can still replace a slot by hand. The studio uses the best one per modification (spoilers need a rear photo, hoods a front one).
            </p>
          </div>
          <button onClick={onClose} className="rounded-full border border-neutral-300 px-3 py-1 text-sm text-neutral-700 hover:border-neutral-500">
            Done
          </button>
        </div>

        <label className="mt-5 inline-block cursor-pointer rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-800">
          Add photos (angles detected automatically)
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={busy !== null}
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (fs.length) addMany(fs);
            }}
          />
        </label>
        {note && <p className="mt-2 text-xs text-neutral-600">{note}</p>}

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {ANGLES.map((a) => {
            const photo = photos.find((p) => p.angle === a.key);
            const working = busy === a.key;
            return (
              <div key={a.key} className="rounded-xl border border-neutral-200 p-2">
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-neutral-100">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.url} alt={a.label} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-neutral-400">
                      {a.hint}
                    </div>
                  )}
                  {working && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs text-neutral-700">Working…</div>
                  )}
                </div>
                <p className="mt-2 text-xs font-medium text-neutral-800">{a.label}</p>
                <div className="mt-1 flex items-center gap-3">
                  <label className="cursor-pointer text-xs font-medium text-amber-700 hover:underline">
                    {photo ? "Replace" : "Add"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={busy !== null}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) upload(a.key, f);
                      }}
                    />
                  </label>
                  {photo && (
                    <button
                      onClick={() => remove(photo)}
                      disabled={busy !== null}
                      className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

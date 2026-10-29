"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/Button";
import { ANGLES, type PhotoAngle } from "@/lib/angles";
import IdentifyChat, { type Candidate } from "./IdentifyChat";
import { detectPhoto } from "@/lib/detect";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export default function AddCarButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [angle, setAngle] = useState<PhotoAngle>("front_34");
  const [identifying, setIdentifying] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setMake("");
    setModel("");
    setYear("");
    setFile(null);
    setAngle("front_34");
    setCandidates(null);
    setIdentifyError(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function close() {
    if (loading) return;
    setOpen(false);
    reset();
  }

  async function identify(f: File) {
    setIdentifying(true);
    setIdentifyError(null);
    setCandidates(null);
    const r = await detectPhoto(f);
    if ("error" in r) {
      setIdentifyError(r.error + " Enter the car manually below.");
    } else {
      if (r.angle) setAngle(r.angle);
      if (r.candidates.length) setCandidates(r.candidates);
      else setIdentifyError("Could not identify the car. Enter it manually below.");
    }
    setIdentifying(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!make.trim() || !model.trim()) {
      setError("Make and model are required.");
      return;
    }
    if (!file) {
      setError("Add a photo of the car.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Photo must be under 5MB.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Your session expired — refresh and log in again.");
      setLoading(false);
      return;
    }

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("car-photos")
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      setError(uploadError.message);
      setLoading(false);
      return;
    }

    const { data: newCar, error: insertError } = await supabase
      .from("cars")
      .insert({
        user_id: user.id,
        make: make.trim(),
        model: model.trim(),
        year: year ? Number(year) : null,
        photo_url: path,
      })
      .select("id")
      .single();

    let photoError = insertError;
    if (!photoError && newCar) {
      const { error: pErr } = await supabase
        .from("car_photos")
        .insert({ car_id: newCar.id, user_id: user.id, angle, storage_path: path });
      if (pErr) {
        await supabase.from("cars").delete().eq("id", newCar.id);
        photoError = pErr;
      }
    }

    setLoading(false);

    if (photoError) {
      // The upload succeeded but the row didn't — clean up the orphaned
      // file rather than leaving it billed against the user's storage.
      await supabase.storage.from("car-photos").remove([path]);
      setError(photoError.message);
      return;
    }

    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-neutral-900"
      >
        + Add a car
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.3)] sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-xl font-semibold tracking-tight text-neutral-900">
              Add a car
            </h2>

            <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-neutral-700" htmlFor="make">
                    Make
                  </label>
                  <input
                    id="make"
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                    placeholder="Porsche"
                    className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm text-neutral-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-neutral-700" htmlFor="model">
                    Model
                  </label>
                  <input
                    id="model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="911 GT3 RS"
                    className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm text-neutral-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700" htmlFor="year">
                  Year
                </label>
                <input
                  id="year"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2023"
                  min={1900}
                  max={2100}
                  className="w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-sm text-neutral-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700" htmlFor="photo">
                  Photo
                </label>
                <input
                  ref={fileInputRef}
                  id="photo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    setCandidates(null);
                    if (f) identify(f);
                  }}
                  className="w-full rounded-xl border border-dashed border-neutral-300 px-3.5 py-2.5 text-sm text-neutral-600 outline-none file:mr-3 file:rounded-full file:border-0 file:bg-amber-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-amber-700"
                />
                {file && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                    <span>{identifying ? "Looking at your photo…" : "Detected angle:"}</span>
                    {!identifying && (
                      <select
                        id="angle"
                        value={angle}
                        onChange={(e) => setAngle(e.target.value as PhotoAngle)}
                        className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-800"
                      >
                        {ANGLES.map((a) => (
                          <option key={a.key} value={a.key}>{a.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <p className="mt-1 text-xs text-neutral-500">The angle is detected automatically. You can add the other angles from the car's card.</p>
                {identifyError && <p className="mt-2 text-xs text-red-600">{identifyError}</p>}
                {candidates && (
                  <div className="mt-3">
                    <IdentifyChat
                      candidates={candidates}
                      onConfirm={(c) => {
                        setMake(c.make);
                        setModel(c.model);
                        setYear(c.year ? String(c.year) : "");
                      }}
                      onManual={() => {}}
                    />
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={close}
                  disabled={loading}
                  className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-400 disabled:opacity-50"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-neutral-900 disabled:opacity-60"
                >
                  {loading ? "Adding…" : "Add car"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

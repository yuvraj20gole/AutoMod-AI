"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Car } from "@/lib/types";
import CarPhotosManager, { type ManagedPhoto } from "./CarPhotosManager";

export default function CarCard({
  car,
  photoUrl,
  photos,
}: {
  car: Car;
  photoUrl: string | null;
  photos: ManagedPhoto[];
}) {
  const [managing, setManaging] = useState(false);
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const supabase = createClient();

    const paths = Array.from(
      new Set([...photos.map((p) => p.path), ...(car.photo_url ? [car.photo_url] : [])])
    );
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("car-photos")
        .remove(paths);
      // A missing file shouldn't block removing the row itself — but a
      // real permission/network error should stop here and surface.
      if (storageError && storageError.message !== "Object not found") {
        setDeleting(false);
        setError(storageError.message);
        return;
      }
    }

    const { error: deleteError } = await supabase.from("cars").delete().eq("id", car.id);

    setDeleting(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      {managing && (
        <CarPhotosManager
          carId={car.id}
          carName={`${car.make} ${car.model}`}
          photos={photos}
          onClose={() => setManaging(false)}
        />
      )}
      <div className="relative aspect-[4/3] w-full bg-neutral-100">
        {photoUrl ? (
          <Image src={photoUrl} alt={`${car.make} ${car.model}`} fill className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            No photo
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="text-sm font-semibold text-neutral-900">
          {car.year ? `${car.year} ` : ""}
          {car.make} {car.model}
        </h3>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <p className="mt-0.5 text-xs text-neutral-500">
          {photos.length} of 5 angles added
        </p>

        {!confirming && (
          <button
            onClick={() => setManaging(true)}
            className="mt-3 mr-2 inline-block rounded-full border border-neutral-300 px-4 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-500"
          >
            Manage photos
          </button>
        )}

        {(car.photo_url || photos.length > 0) && !confirming && (
          <Link
            href={`/dashboard/cars/${car.id}/studio`}
            className="mt-3 inline-block rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Open studio
          </Link>
        )}

        {!confirming && (
          <Link
            href={`/dashboard/advisor?carId=${car.id}`}
            className="mt-3 ml-2 inline-block rounded-full border border-amber-500 px-4 py-1.5 text-xs font-medium text-neutral-800 transition-colors hover:bg-amber-50"
          >
            Upgrade advisor
          </Link>
        )}

        {confirming ? (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-neutral-600">Delete this car?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="rounded-full border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-400"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="ml-3 mt-3 text-xs font-medium text-red-600 transition-colors hover:text-red-700"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

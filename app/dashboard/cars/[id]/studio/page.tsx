import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import StudioClient, { type StudioPhoto } from "@/components/studio/StudioClient";
import type { Car, CarPhoto } from "@/lib/types";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: car } = await supabase.from("cars").select("*").eq("id", id).single();
  if (!car) notFound();

  const typedCar = car as Car;
  const carName = `${typedCar.year ? `${typedCar.year} ` : ""}${typedCar.make} ${typedCar.model}`;

  const { data: rows } = await supabase.from("car_photos").select("*").eq("car_id", id);
  let sources = ((rows ?? []) as CarPhoto[]).map((r) => ({
    id: r.id,
    angle: r.angle,
    path: r.storage_path,
  }));
  if (sources.length === 0 && typedCar.photo_url) {
    sources = [{ id: "legacy", angle: "front_34", path: typedCar.photo_url }];
  }

  const photos: StudioPhoto[] = (
    await Promise.all(
      sources.map(async (s) => {
        const { data } = await supabase.storage
          .from("car-photos")
          .createSignedUrl(s.path, SIGNED_URL_TTL_SECONDS);
        return data?.signedUrl ? { id: s.id, angle: s.angle, url: data.signedUrl } : null;
      })
    )
  ).filter((p): p is StudioPhoto => p !== null);

  return (
    <div>
      <DashboardPageHeader
        title={`Studio: ${carName}`}
        description="Pick a modification and generate a before/after preview of your car."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/dashboard/cars/${typedCar.id}/advisor`}
              className="rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
            >
              Upgrade advisor
            </Link>
            <Link
              href="/dashboard/cars"
              className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm text-neutral-700 transition-colors hover:border-neutral-500"
            >
              Back to cars
            </Link>
          </div>
        }
      />
      {photos.length > 0 ? (
        <StudioClient carId={typedCar.id} carName={carName} photos={photos} />
      ) : (
        <p className="text-sm text-neutral-600">
          This car has no photo yet. Add one from My Cars to use the studio.
        </p>
      )}
    </div>
  );
}

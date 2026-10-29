import { createClient } from "@/lib/supabase/server";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import PlaceholderCard from "@/components/dashboard/PlaceholderCard";
import AddCarButton from "@/components/dashboard/cars/AddCarButton";
import CarCard from "@/components/dashboard/cars/CarCard";
import type { Car, CarPhoto } from "@/lib/types";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export default async function MyCarsPage() {
  const supabase = await createClient();

  // RLS already scopes this to the logged-in user's own rows — no
  // .eq("user_id", ...) needed, the database enforces it either way.
  const { data: cars } = await supabase
    .from("cars")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: photoRows } = await supabase.from("car_photos").select("*");
  const allPhotos = await Promise.all(
    ((photoRows ?? []) as CarPhoto[]).map(async (p) => {
      const { data } = await supabase.storage
        .from("car-photos")
        .createSignedUrl(p.storage_path, SIGNED_URL_TTL_SECONDS);
      return { id: p.id, carId: p.car_id, angle: p.angle, path: p.storage_path, url: data?.signedUrl ?? "" };
    })
  );

  const carsWithPhotos = await Promise.all(
    ((cars ?? []) as Car[]).map(async (car) => {
      const photos = allPhotos
        .filter((p) => p.carId === car.id && p.url)
        .map(({ id, angle, path, url }) => ({ id, angle, path, url }));
      const primary = photos.find((p) => p.angle === "front_34") ?? photos[0];
      if (primary) return { car, photoUrl: primary.url, photos };
      if (!car.photo_url) return { car, photoUrl: null, photos };
      const { data } = await supabase.storage
        .from("car-photos")
        .createSignedUrl(car.photo_url, SIGNED_URL_TTL_SECONDS);
      return { car, photoUrl: data?.signedUrl ?? null, photos };
    })
  );

  return (
    <div>
      <DashboardPageHeader
        title="My Cars"
        description="The cars you've added — upload a photo to get started."
        action={<AddCarButton />}
      />

      {carsWithPhotos.length === 0 ? (
        <PlaceholderCard
          icon={
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 13l1.5-4.5A2 2 0 0 1 6.4 7h11.2a2 2 0 0 1 1.9 1.5L21 13" />
              <path d="M3 13h18v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4Z" />
              <circle cx="7.5" cy="13" r="1.2" />
              <circle cx="16.5" cy="13" r="1.2" />
            </svg>
          }
          title="No cars yet"
          body="Add your first car to start building mods for it."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {carsWithPhotos.map(({ car, photoUrl, photos }) => (
            <CarCard key={car.id} car={car} photoUrl={photoUrl} photos={photos} />
          ))}
        </div>
      )}
    </div>
  );
}

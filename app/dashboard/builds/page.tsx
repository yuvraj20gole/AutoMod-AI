import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import PlaceholderCard from "@/components/dashboard/PlaceholderCard";
import CompareSlider from "@/components/studio/CompareSlider";
import { modLabel } from "@/lib/mods";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

type BuildRow = {
  id: string;
  car_id: string;
  mod_category: string | null;
  before_image_url: string | null;
  after_image_url: string | null;
  engine?: string | null;
  params: { option?: string; engine?: string } | null;
  created_at: string;
  cars: { make: string; model: string; year: number | null } | null;
};

export default async function MyBuildsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("builds")
    .select(
      "id, car_id, mod_category, before_image_url, after_image_url, engine, params, created_at, cars(make, model, year)"
    )
    .order("created_at", { ascending: false });

  const builds = ((data ?? []) as unknown as BuildRow[]).filter(
    (b) => b.before_image_url && b.after_image_url
  );

  const items = await Promise.all(
    builds.map(async (b) => {
      const [before, after] = await Promise.all([
        supabase.storage.from("car-photos").createSignedUrl(b.before_image_url!, SIGNED_URL_TTL_SECONDS),
        supabase.storage.from("car-photos").createSignedUrl(b.after_image_url!, SIGNED_URL_TTL_SECONDS),
      ]);
      return { build: b, beforeUrl: before.data?.signedUrl, afterUrl: after.data?.signedUrl };
    })
  );

  return (
    <div>
      <DashboardPageHeader
        title="My Builds"
        description="Saved AI-generated mod previews, before and after, per car."
      />
      {items.length === 0 ? (
        <PlaceholderCard
          icon={
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 2 8l10 5 10-5-10-5Z" />
              <path d="M2 12l10 5 10-5" />
              <path d="M2 16l10 5 10-5" />
            </svg>
          }
          title="No builds yet"
          body="Open the studio from My Cars, pick a modification and generate your first preview."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {items.map(({ build, beforeUrl, afterUrl }) => {
            const car = build.cars;
            const carName = car ? `${car.year ? `${car.year} ` : ""}${car.make} ${car.model}` : "Car";
            return (
              <div key={build.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                {beforeUrl && afterUrl && (
                  <CompareSlider beforeUrl={beforeUrl} afterUrl={afterUrl} alt={carName} />
                )}
                <div className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{carName}</p>
                    <p className="text-xs text-neutral-500">
                      {modLabel(build.mod_category ?? "", build.params?.option ?? "")} ·{" "}
                      {new Date(build.created_at).toLocaleDateString()}
                    </p>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        (build.engine ?? build.params?.engine) === "detailed"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {(build.engine ?? build.params?.engine) === "detailed" ? "Detailed" : "Fast"}
                    </span>
                  </div>
                  <Link
                    href={`/dashboard/cars/${build.car_id}/studio`}
                    className="text-xs font-medium text-amber-700 hover:underline"
                  >
                    Open studio
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

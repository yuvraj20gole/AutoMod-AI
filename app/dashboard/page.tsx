import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ANGLES } from "@/lib/angles";
import { MOD_CATEGORIES, modLabel } from "@/lib/mods";
import type { Car, CarPhoto } from "@/lib/types";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

type BuildRow = {
  id: string;
  car_id: string;
  mod_category: string | null;
  before_image_url: string | null;
  after_image_url: string | null;
  params: { option?: string } | null;
  created_at: string;
  cars: { make: string; model: string; year: number | null } | null;
};

const btn =
  "rounded-full border border-neutral-300 px-3.5 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-amber-500 hover:bg-amber-50";
const btnPrimary =
  "rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800";

/** Rotated by day-of-year, so everyone sees the same tip all day. */
const TIPS = [
  "Upload a front 3/4 photo first for the best identification — it shows the make, model and shape most clearly.",
  "Use a rear 3/4 photo for spoilers — the engine needs to see the boot and tail lights.",
  "Lighter cars show hood edits best — the contrast makes the new finish easy to judge.",
  "Side photos are the most honest for wheels and paint — no perspective tricks.",
  "Type what you want in the Upgrade advisor, e.g. “more horsepower under 50k” — it understands budgets too.",
  "Before spending on power, brakes and tyres give the most real-world gain per rupee.",
];

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

function carNameOf(c: { make: string; model: string; year: number | null } | null): string {
  return c ? `${c.year ? `${c.year} ` : ""}${c.make} ${c.model}` : "Car";
}

/**
 * Overview: hero status + garage + activity timeline, with quick
 * actions and a daily tip in the side column. Deliberately NOT the My
 * Builds gallery (no sliders, no big cards). Every query uses the
 * RLS-scoped server client and is defaulted before rendering, so a
 * failed query or signed URL degrades to empty states, never a crash.
 */
export default async function OverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const name = user?.user_metadata.full_name?.split(" ")[0] || "there";

  const [carsCountRes, buildsCountRes, buildsRes, chipsRes, carsRes, photosRes] =
    await Promise.all([
      supabase.from("cars").select("*", { count: "exact", head: true }),
      supabase.from("builds").select("*", { count: "exact", head: true }),
      supabase
        .from("builds")
        .select(
          "id, car_id, mod_category, before_image_url, after_image_url, params, created_at, cars(make, model, year)"
        )
        .order("created_at", { ascending: false })
        .limit(6),
      supabase.from("builds").select("car_id, mod_category"),
      supabase.from("cars").select("*").order("created_at", { ascending: false }),
      supabase.from("car_photos").select("*").order("created_at", { ascending: true }),
    ]);

  const carsCount = carsCountRes.count ?? 0;
  const buildsCount = buildsCountRes.count ?? 0;

  const builds = (buildsRes.data ?? []) as unknown as BuildRow[];
  const latestBuild = builds[0] ?? null;
  const lastCar = (carsRes.data ?? [])[0] as Car | undefined;

  // Mods already built per car (category chips in the garage).
  const modsByCar = new Map<string, string[]>();
  for (const row of (chipsRes.data ?? []) as { car_id: string; mod_category: string | null }[]) {
    if (!row.mod_category) continue;
    const label = MOD_CATEGORIES.find((c) => c.key === row.mod_category)?.label;
    if (!label) continue;
    const list = modsByCar.get(row.car_id) ?? [];
    if (!list.includes(label)) list.push(label);
    modsByCar.set(row.car_id, list);
  }
  const modOrder = MOD_CATEGORIES.map((c) => c.label);
  for (const list of modsByCar.values()) {
    list.sort((a, b) => modOrder.indexOf(a) - modOrder.indexOf(b));
  }

  // Activity rows with small signed "after" thumbnails.
  const activity = await Promise.all(
    builds.map(async (b) => {
      let thumb: string | null = null;
      const path = b.after_image_url ?? b.before_image_url;
      if (path) {
        try {
          const { data } = await supabase.storage
            .from("car-photos")
            .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
          thumb = data?.signedUrl ?? null;
        } catch {
          thumb = null;
        }
      }
      return { build: b, thumb };
    })
  );

  // Garage cars with thumbnails and angle coverage.
  const allPhotos = (photosRes.data ?? []) as CarPhoto[];
  const garage = await Promise.all(
    ((carsRes.data ?? []) as Car[]).map(async (car) => {
      const photos = allPhotos.filter((p) => p.car_id === car.id);
      const anglesAdded = new Set(photos.map((p) => p.angle)).size;
      const primary = photos.find((p) => p.angle === "front_34") ?? photos[0];
      let photoUrl: string | null = null;
      try {
        const path = primary?.storage_path ?? car.photo_url;
        if (path) {
          const { data } = await supabase.storage
            .from("car-photos")
            .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
          photoUrl = data?.signedUrl ?? null;
        }
      } catch {
        photoUrl = null;
      }
      return { car, photoUrl, anglesAdded, mods: modsByCar.get(car.id) ?? [] };
    })
  );

  const statusLine =
    carsCount === 0
      ? "Add your first car to start previewing modifications."
      : [
          `${carsCount} car${carsCount === 1 ? "" : "s"}`,
          `${buildsCount} build${buildsCount === 1 ? "" : "s"}`,
          latestBuild ? `last edit ${relativeTime(latestBuild.created_at)}` : "no edits yet",
        ].join(" · ");

  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const tip = TIPS[dayIndex % TIPS.length];

  const studioCarId = latestBuild?.car_id ?? lastCar?.id;
  const advisorCarId = lastCar?.id ?? latestBuild?.car_id;

  return (
    <div>
      {/* Hero */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            Welcome back, {name}.
          </h1>
          <p className="mt-1 text-sm text-neutral-600">{statusLine}</p>
        </div>
        {latestBuild && (
          <Link href={`/dashboard/cars/${latestBuild.car_id}/studio`} className={btnPrimary}>
            Continue in Studio
          </Link>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Left: garage + activity */}
        <div className="min-w-0">
          {/* Garage */}
          <h2 className="font-display text-lg font-semibold tracking-tight text-neutral-900">
            Garage
          </h2>
          {garage.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-6">
              <p className="text-sm text-neutral-600">
                You haven&apos;t added a car yet — add one to start previewing modifications.
              </p>
              <Link href="/dashboard/cars" className={`${btnPrimary} mt-4 inline-block`}>
                Add your first car
              </Link>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {garage.map(({ car, photoUrl, anglesAdded, mods }) => (
                <div
                  key={car.id}
                  className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
                >
                  <div className="flex gap-3 p-4">
                    {photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoUrl}
                        alt={carNameOf(car)}
                        className="h-16 w-24 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-[10px] text-neutral-400">
                        No photo
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900">
                        {carNameOf(car)}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {anglesAdded} of {ANGLES.length} angles
                      </p>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{ width: `${(anglesAdded / ANGLES.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  {mods.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                      {mods.map((m) => (
                        <span
                          key={m}
                          className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200/60"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 border-t border-neutral-100 px-4 py-3">
                    <Link href={`/dashboard/cars/${car.id}/studio`} className={btn}>
                      Studio
                    </Link>
                    <Link href={`/dashboard/cars/${car.id}/advisor`} className={btn}>
                      Advisor
                    </Link>
                    <Link href="/dashboard/cars" className={btn}>
                      Photos
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Activity */}
          <div className="mt-10 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-tight text-neutral-900">
              Activity
            </h2>
            <Link href="/dashboard/builds" className="text-xs font-medium text-amber-700 hover:underline">
              View all builds
            </Link>
          </div>
          {activity.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-6">
              <p className="text-sm text-neutral-600">
                No builds yet — open the Studio on one of your cars and generate your first
                preview.
              </p>
              <Link href="/dashboard/cars" className={`${btnPrimary} mt-4 inline-block`}>
                Go to My Cars
              </Link>
            </div>
          ) : (
            <ol className="mt-4 divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white">
              {activity.map(({ build, thumb }) => (
                <li key={build.id}>
                  <Link
                    href="/dashboard/builds"
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50"
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-[10px] text-neutral-400">
                        No image
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-neutral-900">
                        {modLabel(build.mod_category ?? "", build.params?.option ?? "")}
                      </p>
                      <p className="truncate text-xs text-neutral-500">{carNameOf(build.cars)}</p>
                    </div>
                    <span className="shrink-0 text-xs text-neutral-400">
                      {relativeTime(build.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Right: quick actions + tip */}
        <div className="flex min-w-0 flex-col gap-6">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Quick actions
            </h2>
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/dashboard/cars" className={btn}>
                Add a car
              </Link>
              {studioCarId ? (
                <Link href={`/dashboard/cars/${studioCarId}/studio`} className={btn}>
                  Try a mod
                </Link>
              ) : (
                <Link href="/dashboard/cars" className={btn}>
                  Try a mod
                </Link>
              )}
              {advisorCarId ? (
                <Link href={`/dashboard/cars/${advisorCarId}/advisor`} className={btn}>
                  Get upgrade advice
                </Link>
              ) : (
                <Link href="/dashboard/cars" className={btn}>
                  Get upgrade advice
                </Link>
              )}
              <Link href="/dashboard/cars" className={btn}>
                Manage photos
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <h2 className="text-xs font-medium uppercase tracking-wider text-amber-700">
              Tip of the day
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-900">{tip}</p>
          </div>
        </div>
      </div>

      <p className="mt-10 text-center text-xs text-neutral-400">
        Add a car, try a mod in Studio, then get upgrade advice — that&apos;s the whole flow.
      </p>
    </div>
  );
}

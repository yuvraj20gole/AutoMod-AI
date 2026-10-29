import { createClient } from "@/lib/supabase/server";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import AdvisorHub, { type AdvisorHubCar } from "@/components/advisor/AdvisorHub";
import { ADVISOR_DISCLAIMER, LAST_REVIEWED } from "@/lib/advisor/data";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

type CarRow = {
  id: string;
  make: string;
  model: string;
  year: number | null;
  photo_url: string | null;
};

/**
 * Standalone Upgrade Advisor. Protection is inherited from
 * app/dashboard/layout.tsx; the cars query is scoped by RLS to the
 * signed-in user's own cars.
 */
export default async function AdvisorPage({
  searchParams,
}: {
  searchParams: Promise<{ carId?: string | string[] }>;
}) {
  const sp = await searchParams;
  const carIdParam = Array.isArray(sp.carId) ? sp.carId[0] : sp.carId;

  const supabase = await createClient();
  const { data } = await supabase
    .from("cars")
    .select("id, make, model, year, photo_url")
    .order("created_at", { ascending: false });

  const cars: AdvisorHubCar[] = await Promise.all(
    ((data ?? []) as CarRow[]).map(async (c) => {
      let photoUrl: string | null = null;
      if (c.photo_url) {
        const { data: signed } = await supabase.storage
          .from("car-photos")
          .createSignedUrl(c.photo_url, SIGNED_URL_TTL_SECONDS);
        photoUrl = signed?.signedUrl ?? null;
      }
      return { id: c.id, make: c.make, model: c.model, year: c.year, photoUrl };
    })
  );

  const initialCarId = carIdParam && cars.some((c) => c.id === carIdParam) ? carIdParam : null;

  return (
    <div>
      <DashboardPageHeader
        title="Upgrade advisor"
        description="Chat about one of your cars, add a new one, or ask in general — parts, prices and fitment always come from the curated rule engine."
      />

      <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
        {ADVISOR_DISCLAIMER}
      </p>

      <AdvisorHub key={initialCarId ?? "hub"} cars={cars} initialCarId={initialCarId} />

      <p className="mt-6 text-xs text-neutral-500">
        Costs and guidance are curated broad ranges for India, last reviewed {LAST_REVIEWED}. They
        are not live prices — marketplace and map links are searches, and prices there change
        without notice.
      </p>
    </div>
  );
}

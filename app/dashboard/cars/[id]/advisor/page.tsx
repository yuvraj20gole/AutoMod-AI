import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import AdvisorClient from "@/components/advisor/AdvisorClient";
import { ADVISOR_DISCLAIMER, LAST_REVIEWED } from "@/lib/advisor/data";
import type { Car } from "@/lib/types";

/**
 * Upgrade Advisor for one car. Protection is inherited from
 * app/dashboard/layout.tsx (redirects signed-out users), exactly like
 * the Studio route; the cars-table query is additionally scoped by RLS
 * to the signed-in user's own cars.
 */
export default async function AdvisorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: car } = await supabase.from("cars").select("*").eq("id", id).single();
  if (!car) notFound();

  const typedCar = car as Car;
  const carName = `${typedCar.year ? `${typedCar.year} ` : ""}${typedCar.make} ${typedCar.model}`;

  return (
    <div>
      <DashboardPageHeader
        title={`Upgrade advisor: ${carName}`}
        description="Local chat (Ollama) for intent and explanations — parts, prices and fitment always come from the curated rule engine."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/dashboard/cars/${typedCar.id}/studio`}
              className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm text-neutral-700 transition-colors hover:border-neutral-500"
            >
              Open studio
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

      <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
        {ADVISOR_DISCLAIMER}
      </p>

      <AdvisorClient make={typedCar.make} model={typedCar.model} year={typedCar.year} />

      <p className="mt-6 text-xs text-neutral-500">
        Costs and guidance are curated broad ranges for India, last reviewed {LAST_REVIEWED}. They
        are not live prices — marketplace and map links are searches, and prices there change
        without notice.
      </p>
    </div>
  );
}

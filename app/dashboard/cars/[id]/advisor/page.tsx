import { redirect } from "next/navigation";

/**
 * Legacy per-car advisor route. The advisor now lives at
 * /dashboard/advisor; keep this file as a redirect so old links work.
 */
export default async function LegacyCarAdvisorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/advisor?carId=${encodeURIComponent(id)}`);
}

import type { ReactNode } from "react";

/**
 * Shared header for every dashboard page — title/description on the left,
 * an optional action slot on the right (e.g. "Add a car" once My Cars is
 * real). Keeping this consistent now means each new page just plugs in
 * here instead of re-deciding the layout each time.
 */
export default function DashboardPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-neutral-900">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-neutral-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

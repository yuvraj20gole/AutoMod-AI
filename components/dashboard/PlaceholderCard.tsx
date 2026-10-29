import type { ReactNode } from "react";

export default function PlaceholderCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        {icon}
      </div>
      <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-neutral-500">{body}</p>
    </div>
  );
}

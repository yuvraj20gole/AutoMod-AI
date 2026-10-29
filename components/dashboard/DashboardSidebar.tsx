"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "@/components/auth/SignOutButton";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: (
      <>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" />
      </>
    ),
  },
  {
    href: "/dashboard/cars",
    label: "My Cars",
    icon: (
      <>
        <path d="M3 13l1.5-4.5A2 2 0 0 1 6.4 7h11.2a2 2 0 0 1 1.9 1.5L21 13" />
        <path d="M3 13h18v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4Z" />
        <circle cx="7.5" cy="13" r="1.2" />
        <circle cx="16.5" cy="13" r="1.2" />
      </>
    ),
  },
  {
    href: "/dashboard/builds",
    label: "My Builds",
    icon: (
      <>
        <path d="M12 3 2 8l10 5 10-5-10-5Z" />
        <path d="M2 12l10 5 10-5" />
        <path d="M2 16l10 5 10-5" />
      </>
    ),
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </>
    ),
  },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-amber-50 text-amber-700"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-5 w-5 shrink-0 ${isActive ? "text-amber-600" : "text-neutral-400"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {item.icon}
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Desktop: fixed left sidebar. Mobile: same nav items as a horizontal
 * scrollable bar under the header, since a full slide-out drawer isn't
 * worth the complexity yet for four flat top-level items.
 */
export default function DashboardSidebar({
  userLabel,
}: {
  userLabel: string;
}) {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-white px-4 py-6 md:flex">
        <Link className="mb-8 flex items-center gap-2 px-2" href="/">
          <Image src="/logo-icon.png" alt="" width={354} height={219} className="h-6 w-auto" />
          <span className="font-display text-base font-bold tracking-tight text-neutral-900">
            AUTOMOD <span className="text-amber-600">AI</span>
          </span>
        </Link>

        <NavLinks pathname={pathname} />

        <div className="mt-auto flex flex-col gap-3 pt-6">
          <div className="truncate rounded-xl bg-neutral-50 px-3 py-2.5 text-sm text-neutral-600">
            {userLabel}
          </div>
          <SignOutButton className="w-full" />
        </div>
      </aside>

      <div className="border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
        <div className="mb-3 flex items-center justify-between">
          <Link className="flex items-center gap-2" href="/">
            <Image src="/logo-icon.png" alt="" width={354} height={219} className="h-5 w-auto" />
            <span className="font-display text-sm font-bold tracking-tight text-neutral-900">
              AUTOMOD <span className="text-amber-600">AI</span>
            </span>
          </Link>
          <SignOutButton className="px-4 py-1.5 text-xs" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-amber-50 text-amber-700"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

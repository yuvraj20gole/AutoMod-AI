import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Shared frame for /login and /register. Deliberately NOT the homepage's
 * light dot-grid card or a split-screen hero photo — those patterns
 * (Linear, Vercel, Framer's auth pages) converge on something else: a
 * single glass card floating on a dark, technical background, with the
 * back link tucked inside the card rather than pinned to a page corner.
 * The "blueprint" grid + scanning glow echo the AI-analysis motif from
 * How It Works rather than reusing the hero's car photography.
 */
export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-neutral-950 px-6 py-16">
      {/* Blueprint grid — fine technical lines, not the homepage's soft dot
          pattern, so this reads as its own space. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.25]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage:
            "radial-gradient(ellipse 65% 60% at 50% 40%, black 20%, transparent 100%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-[55vmin] w-[55vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.16)_0%,transparent_70%)] blur-3xl"
        aria-hidden
      />

      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.7)] backdrop-blur-xl sm:p-10">
        <a
          className="mb-6 flex w-fit items-center gap-1.5 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-200"
          href="/"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to home
        </a>

        <div className="flex flex-col items-center text-center">
          <a className="mb-6 flex items-center gap-2" href="/">
            <Image src="/logo-icon.png" alt="" width={354} height={219} className="h-7 w-auto" />
          </a>

          <span className="text-xs font-medium uppercase tracking-[0.3em] text-amber-400">
            {eyebrow}
          </span>
          <h1 className="font-display mt-3 text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-neutral-400">{subtitle}</p>
        </div>

        <div className="mt-8">{children}</div>

        <p className="mt-6 text-center text-sm text-neutral-400">{footer}</p>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Button from "./Button";
import { useLiquidGlass } from "@/hooks/useLiquidGlass";

// Every link points at a section that actually exists — no placeholder
// destinations. The rotation sequence (#reveal) deliberately has no tab:
// it's a showcase, not a page a visitor navigates "to".
const LINKS = [
  { href: "#top", label: "Home" },
  { href: "#how-it-works", label: "How it Works" },
  { href: "#finish", label: "Mods" },
];

/**
 * Persistent top nav — fixed so it stays over both the dark hero and the
 * lighter sections beneath it. Real liquid-glass refraction (same engine as
 * the hero's feature strip) instead of a flat blur, so whatever's scrolling
 * underneath — the car footage, the light Finish/Stance sections — actually
 * bends at the bar's bottom edge.
 *
 * Text color adapts to whatever's directly behind the bar: every top-level
 * section carries a `data-nav-theme="dark" | "light"` attribute (dark bg ->
 * white text, light bg -> dark text). On every scroll frame we sample the
 * element sitting just under the bar and read its nearest theme ancestor,
 * rather than tracking scrollY thresholds — that stays correct even though
 * the Reveal section is pinned/sticky and doesn't move like a normal block.
 */
export default function SiteHeader() {
  const headerRef = useRef<HTMLElement>(null);
  const glassRef = useRef<HTMLDivElement>(null);
  useLiquidGlass(glassRef, { scale: -70, chroma: 4, blur: 3, saturate: 1.5, radius: 0 });

  const [active, setActive] = useState("#top");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const sections = LINKS.map((link) =>
      document.querySelector(link.href)
    ).filter((el): el is Element => el !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(`#${entry.target.id}`);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;

    function sampleTheme() {
      raf = 0;
      const header = headerRef.current;
      if (!header) return;
      const y = header.getBoundingClientRect().bottom + 4;
      const x = window.innerWidth / 2;
      const el = document.elementFromPoint(x, y);
      const themed = el?.closest("[data-nav-theme]") as HTMLElement | null;

      // The rotation sequence's own background is light gray, but specific
      // frames (the engine-bay push-in) go dark at the top — a fixed
      // per-section theme reads wrong either way. Sample the actual pixel
      // under the bar instead, straight off the canvas that's drawing it.
      if (themed?.id === "reveal") {
        const canvas = themed.querySelector("canvas");
        const rect = canvas?.getBoundingClientRect();
        if (canvas && rect && rect.width > 0 && rect.height > 0) {
          const cx = Math.round(((x - rect.left) / rect.width) * canvas.width);
          const cy = Math.round(((y - rect.top) / rect.height) * canvas.height);
          if (cx >= 0 && cy >= 0 && cx < canvas.width && cy < canvas.height) {
            try {
              const ctx = canvas.getContext("2d");
              const pixel = ctx?.getImageData(cx, cy, 1, 1).data;
              if (pixel) {
                const luminance = 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2];
                const next = luminance > 150 ? "light" : "dark";
                setTheme((prev) => (prev === next ? prev : next));
                return;
              }
            } catch {
              // Fall through to the attribute-based theme below.
            }
          }
        }
      }

      const next = themed?.dataset.navTheme === "light" ? "light" : "dark";
      setTheme((prev) => (prev === next ? prev : next));
    }

    function onScrollOrResize() {
      if (!raf) raf = requestAnimationFrame(sampleTheme);
    }

    sampleTheme();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const isLight = theme === "light";

  return (
    <header ref={headerRef} className="fixed inset-x-0 top-0 z-50">
      <div
        ref={glassRef}
        className="relative overflow-hidden bg-gradient-to-b from-white/[0.1] to-white/[0.03] shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.14),inset_0_1px_1px_rgba(255,255,255,0.3)]"
      >
        <div className="mx-auto flex max-w-[100rem] items-center justify-between px-6 py-4 sm:px-10 md:px-14">
          <a className="flex items-center gap-2" href="#top">
            {/* Real brand mark asset — not a hand-drawn SVG recreation. */}
            <Image
              src="/logo-icon.png"
              alt=""
              width={354}
              height={219}
              className="h-5 w-auto"
              priority
            />
            <span
              className={`font-display text-lg font-bold tracking-tight transition-colors duration-300 ${
                isLight ? "text-neutral-900" : "text-neutral-50"
              }`}
            >
              AUTOMOD{" "}
              <span className={isLight ? "text-amber-600" : "text-amber-400"}>
                AI
              </span>
            </span>
          </a>

          <nav
            className={`hidden items-center gap-8 text-sm font-medium transition-colors duration-300 md:flex ${
              isLight ? "text-neutral-600" : "text-neutral-300"
            }`}
          >
            {LINKS.map((link) => {
              const isActive = active === link.href;
              return (
                <a
                  className={`relative flex flex-col items-center gap-1.5 py-1 transition-colors duration-300 ${
                    isActive
                      ? isLight
                        ? "font-semibold text-neutral-900"
                        : "font-semibold text-neutral-50"
                      : isLight
                        ? "hover:text-neutral-900"
                        : "hover:text-neutral-50"
                  }`}
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                  <span
                    className={`h-1.5 w-1.5 rounded-full transition-opacity ${
                      isLight ? "bg-amber-600" : "bg-amber-400"
                    } ${isActive ? "opacity-100" : "opacity-0"}`}
                    aria-hidden
                  />
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-4">
            <a
              className={`hidden text-sm font-medium transition-colors duration-300 sm:inline ${
                isLight ? "text-neutral-600 hover:text-neutral-900" : "text-neutral-300 hover:text-neutral-50"
              }`}
              href="/login"
            >
              Log in
            </a>
            <Button
              href="/register"
              className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-neutral-900"
            >
              Get Started →
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

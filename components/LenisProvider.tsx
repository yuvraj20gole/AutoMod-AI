"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Single source of truth for scroll on this page. Lenis smooths native
 * window scrolling; GSAP's ticker is the only rAF loop, driving both
 * lenis.raf() and ScrollTrigger.update() on every Lenis scroll event.
 * Framer Motion's useScroll reads the same native scrollY Lenis produces,
 * so all three animation systems stay in lockstep without duplicating
 * the smoothing/raf work.
 */
export default function LenisProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Smooth scrolling is a landing-page feature (scroll-scrubbed
  // sequence + ScrollTrigger). On dashboard routes Lenis's
  // virtual-scroll hijack can leave long pages (e.g. advisor
  // recommendations) unscrollable by wheel, so native scroll wins
  // there — which is also how the rest of the dashboard behaves.
  const isDashboard = pathname?.startsWith("/dashboard") ?? false;

  useEffect(() => {
    if (isDashboard) return;
    const lenis = new Lenis({
      autoRaf: false,
      duration: 1.1,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
    });

    lenis.on("scroll", ScrollTrigger.update);

    const tick = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Clicking a plain <a href="#..."> makes the browser jump the real
    // page directly — Lenis never sees that as a scroll event, so its
    // internal position goes stale, and the pinned Reveal section (which
    // relies on ScrollTrigger tracking the *actual* scroll position)
    // desyncs until the next manual scroll snaps it back into place.
    // Route every in-page anchor through Lenis's own scrollTo instead, so
    // its state — and everything reading it, including the nav's active-
    // link tracking — never falls out of sync in the first place.
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement)?.closest?.(
        "a[href^='#']"
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href === "#") return;
      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();
      const header = document.querySelector("header");
      const offset = header ? -(header.getBoundingClientRect().height + 12) : -80;
      lenis.scrollTo(target as HTMLElement, { offset });
      history.pushState(null, "", href);
    }
    document.addEventListener("click", handleClick);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      document.removeEventListener("click", handleClick);
    };
  }, [isDashboard]);

  return <>{children}</>;
}

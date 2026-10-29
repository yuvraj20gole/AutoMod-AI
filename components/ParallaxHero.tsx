"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { motion, useReducedMotion } from "framer-motion";
import TextEffect from "./motion-primitives/TextEffect";
import Button from "./Button";
import { useLiquidGlass } from "@/hooks/useLiquidGlass";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Scroll-driven orbit around the car (Higgsfield seedance_2_0), generated
// from a cropped frame of the user's own reference mockup video (car only,
// fake nav/UI cropped out) as the start_image — carries over the glossy
// reflective-floor look and the amber "A" light shape as real baked-in
// footage instead of a CSS approximation. Not reused from the lighter 360°
// Studio sequence below, which has a different (plain studio) background.
const HERO_FRAME_COUNT = 24;
const heroFrameUrl = (i: number) =>
  `/frames-hero/frame-${String(i + 1).padStart(3, "0")}.jpg`;

// Cover-fit draw: fills the whole canvas, cropping the source rather than
// letterboxing it. Centered — the left scrim (below) is what actually
// clears the copy column, not the crop, so there's no risk of cropping the
// car itself oddly by biasing the source window. No synthetic floor
// reflection here (there was one earlier): this footage already has a real,
// photographed reflective floor baked in, so a second CSS/canvas reflection
// on top would just double up and muddy it.
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number
) {
  const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, dx, dy, dw, dh);
}

const FEATURES = [
  {
    body: "Generate mods instantly",
    icon: (
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    ),
    title: "AI-Powered",
  },
  {
    body: "See every angle, live",
    icon: <path d="M21 8 12 3 3 8l9 5 9-5ZM3 8v8l9 5M21 8v8l-9 5M12 13v8" />,
    title: "Real-Time 3D",
  },
  {
    body: "Infinite possibilities",
    icon: (
      <path d="M4 6h16M4 6a2 2 0 1 0 4 0 2 2 0 1 0-4 0ZM4 18h16M16 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0ZM4 12h16M10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0Z" />
    ),
    title: "Endless Mods",
  },
  {
    body: "Tuned for Indian roads",
    icon: <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12ZM12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
    title: "India-Ready",
  },
];

export default function ParallaxHero() {
  const root = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const frameStateRef = useRef({ frame: 0 });
  const glassRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const [heroReady, setHeroReady] = useState(false);

  // Real Apple-style glass refraction on the bottom feature strip — the
  // backdrop (the car footage) actually bends at the panel's rim, not just
  // a flat blur. Chromium gets the full effect; Safari/Firefox fall back to
  // a frosted blur automatically (see the hook).
  useLiquidGlass(glassRef, { scale: -90, chroma: 5, blur: 3, saturate: 1.6 });

  function renderHeroFrame(index: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const i = Math.max(0, Math.min(HERO_FRAME_COUNT - 1, Math.round(index)));
    const img = imagesRef.current[i];
    if (!img || !img.complete || !img.naturalWidth) return;
    drawCover(ctx, img, canvas.width, canvas.height);
  }

  function resizeHeroCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    renderHeroFrame(frameStateRef.current.frame);
  }

  // ---- Preload the orbit frames, paint frame 0 as soon as it's in ----
  useEffect(() => {
    const images: HTMLImageElement[] = new Array(HERO_FRAME_COUNT);
    let loaded = 0;
    let cancelled = false;

    const drawFirst = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const img = images[0];
      if (!canvas || !ctx || !img?.complete || !img.naturalWidth) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      drawCover(ctx, img, canvas.width, canvas.height);
    };

    for (let i = 0; i < HERO_FRAME_COUNT; i++) {
      const img = new window.Image();
      img.decoding = "async";
      img.onload = img.onerror = () => {
        if (cancelled) return;
        loaded++;
        if (i === 0) drawFirst();
        if (loaded === HERO_FRAME_COUNT) setHeroReady(true);
      };
      img.src = heroFrameUrl(i);
      images[i] = img;
    }
    imagesRef.current = images;
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.addEventListener("resize", resizeHeroCanvas, { passive: true });
    return () => window.removeEventListener("resize", resizeHeroCanvas);
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      // Subtler travel on small screens so nothing drifts off-frame.
      mm.add(
        {
          isDesktop: "(min-width: 768px)",
          isMobile: "(max-width: 767px)",
          reduce: "(prefers-reduced-motion: reduce)",
        },
        (ctx) => {
          const { isDesktop, reduce } = ctx.conditions as {
            isDesktop: boolean;
            isMobile: boolean;
            reduce: boolean;
          };
          if (reduce) return; // honor reduced-motion: no parallax drift

          const k = isDesktop ? 1 : 0.5;
          gsap.to("[data-layer='headline']", {
            ease: "none",
            scrollTrigger: {
              trigger: root.current,
              start: "top top",
              end: "bottom bottom",
              // Same reasoning as ScrollSequence: Lenis already provides the
              // inertia/smoothing, so a low scrub value here tracks it
              // closely instead of stacking a second lag on top.
              scrub: 0.3,
            },
            yPercent: -18 * k,
          });
        }
      );

      // Orbit scrub — separate ScrollTrigger, same trigger/range as the
      // parallax tween above, tuned like ScrollSequence's own scrub.
      if (heroReady) {
        resizeHeroCanvas();
        gsap.to(frameStateRef.current, {
          frame: HERO_FRAME_COUNT - 1,
          ease: "none",
          snap: "frame",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.2,
            invalidateOnRefresh: true,
            onRefresh: resizeHeroCanvas,
          },
          onUpdate: () => renderHeroFrame(frameStateRef.current.frame),
        });
      }
    },
    { scope: root, dependencies: [heroReady] }
  );

  return (
    <section
      id="top"
      ref={root}
      className="relative h-[160vh] bg-neutral-950"
      data-nav-theme="dark"
    >
      {/* Scroll-locked intro: this inner stage stays pinned (sticky) for the
          whole 160vh of the outer section, so the hero holds in place while
          the parallax layers play out, before releasing into the sequence
          below. Same pin pattern as ScrollSequence's sticky stage. */}
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* Full-bleed orbit video — the actual hero background, cover-fit
            cropped to fill the viewport. The left scrim below (not the
            crop) is what clears the copy column, so the car itself is
            never cropped oddly to make room for it. */}
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{
            backgroundImage: heroReady
              ? undefined
              : "url(/frames-hero/frame-001.jpg)",
          }}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full"
            aria-label="Porsche 911 GT3 RS in Racing Yellow, orbiting on scroll"
            role="img"
          />
        </div>

        {/* No custom "A" shape, warm-grade wash, or floor-glow overlay here
            anymore — the footage itself already bakes in the amber "A"
            light, the reflective floor, and the warm rim lighting (that's
            the whole point of generating from the reflective-floor
            reference), so adding CSS/canvas versions on top just doubled
            up and muddied it. Only the legibility scrims below remain. */}

        {/* Left scrim — guarantees the copy column stays legible against
            whatever the footage is doing there, independent of frame. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-full bg-gradient-to-r from-black/85 via-black/40 to-transparent md:w-[64%]" />
        {/* Full-frame vignette — light overall grounding, top and bottom. */}
        <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-b from-black/45 via-transparent to-black/55" />

        {/* Film grain — a flat black hero reads cheap; a faint noise texture
            (the same trick most award-grade dark hero sections use) keeps it
            filmic instead of banding. Purely decorative, tiled, non-interactive. */}
        <div
          className="pointer-events-none absolute inset-0 z-40 opacity-[0.05] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
          aria-hidden
        />

        {/* Hero content — left column, sitting in the car's own negative
            space rather than stamped across the body. Nudged up from dead
            center, and still parallaxes on scroll (faster than the car). */}
        <div
          data-layer="headline"
          className="pointer-events-none absolute inset-y-0 left-0 z-20 flex w-full max-w-xl -translate-y-[9vh] flex-col justify-center gap-5 px-8 will-change-transform sm:px-12 md:pl-20 md:-translate-y-[14vh]"
        >
          <div className="pointer-events-auto inline-flex w-fit items-center gap-2 rounded-full border border-amber-400/30 bg-black/40 px-4 py-1.5 backdrop-blur-sm">
            <svg
              aria-hidden
              className="h-3.5 w-3.5 text-amber-400"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <span className="text-sm font-semibold uppercase tracking-wide text-amber-400">
              AI car modding reimagined
            </span>
          </div>

          <h1 className="font-display text-5xl font-bold leading-[1.08] tracking-tight sm:text-6xl md:text-7xl">
            <span className="block text-neutral-50">
              <TextEffect inView={false}>Build it in</TextEffect>
            </span>
            <span className="block bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              <TextEffect inView={false}>your head.</TextEffect>
            </span>
          </h1>

          <p className="max-w-md text-lg text-neutral-300 md:text-xl">
            Reimagine any car with AI — every mod, every angle, in real time.
          </p>

          <div className="pointer-events-auto flex flex-wrap items-center gap-4">
            <Button className="rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-neutral-900">
              Start Building →
            </Button>
            <motion.a
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 22, mass: 0.9 }}
              className="rounded-full border border-neutral-600 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-neutral-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_6px_16px_-6px_rgba(0,0,0,0.4)] transition-colors duration-300 hover:border-neutral-400 hover:bg-white/[0.08] hover:text-white"
              href="#reveal"
            >
              Explore Gallery
            </motion.a>
          </div>
        </div>

        {/* Bottom feature strip — real, plausible product-vision features
            (not fabricated usage stats or fake testimonials). True liquid-
            glass refraction (via useLiquidGlass above): the footage behind
            this panel actually bends at its rim, not just a flat blur. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[9vh] z-20 hidden justify-center px-6 sm:flex">
          <div
            ref={glassRef}
            className="relative grid w-full max-w-4xl grid-cols-2 gap-x-6 gap-y-5 overflow-hidden rounded-2xl bg-gradient-to-b from-white/[0.1] to-white/[0.03] px-6 py-5 shadow-[0_24px_60px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.35),inset_0_-8px_20px_rgba(255,255,255,0.05),inset_0_0_0_1px_rgba(255,255,255,0.12)] md:grid-cols-4"
          >
            {FEATURES.map((feature) => (
              <div className="flex items-center gap-3" key={feature.title}>
                <svg
                  aria-hidden
                  className="h-5 w-5 shrink-0 text-amber-400"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  {feature.icon}
                </svg>
                <div>
                  <p className="text-sm font-semibold text-neutral-50">
                    {feature.title}
                  </p>
                  <p className="text-xs text-neutral-400">{feature.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll cue — centered under the feature strip, desktop-only. */}
        <div className="absolute bottom-6 left-1/2 z-30 hidden -translate-x-1/2 flex-col items-center gap-2 sm:flex">
          <span className="text-xs uppercase tracking-[0.2em] text-neutral-600">
            Scroll
          </span>
          <div className="flex h-8 w-5 items-start justify-center rounded-full border border-neutral-700">
            <motion.span
              className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400"
              animate={
                prefersReducedMotion
                  ? undefined
                  : { y: [0, 12, 0], opacity: [1, 0.3, 1] }
              }
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

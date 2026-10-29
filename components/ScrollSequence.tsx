"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import RevealClosingCopy from "./RevealClosingCopy";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export const FRAME_COUNT = 241;
const frameUrl = (i: number) =>
  `/frames-v2/frame-${String(i + 1).padStart(3, "0")}.jpg`;

// Choreography beats, in frame indices (0-based), mapped from the actual
// extracted sequence (public/frames-v2/, sourced from the Higgsfield
// Seedance 2.0 render) rather than the original video prompt's intended
// timestamps — AI video generation doesn't hit literal timecodes exactly.
export const BEATS = {
  introEnd: 48, // rotation only, front -> rear 3/4
  engineStart: 48, // engine cover opens ~frame 45-60, holds open after
  doorStart: 160, // driver door + frunk open together, camera settles to side profile
  frunkStart: 160,
};

// This section's own light studio background, sampled directly from the
// video frames' actual backdrop (mean corner color across the sequence).
// Frames are plain JPGs with no alpha — no chroma-key or difference-matte
// needed this time, since the source was generated with a matching light
// gray-white studio backdrop. The canvas fill only shows in any letterbox
// margin ("contain" fit vs. viewport aspect), so matching it to the video's
// own backdrop keeps that margin invisible.
const PAGE_BG = "#b7b6bc";

export default function ScrollSequence() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const stateRef = useRef({ frame: 0 });
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  // ---- Preload every frame, then draw the first one ----
  useEffect(() => {
    const images: HTMLImageElement[] = new Array(FRAME_COUNT);
    let loaded = 0;
    let cancelled = false;

    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.decoding = "async";
      img.onload = img.onerror = () => {
        if (cancelled) return;
        loaded++;
        setProgress(Math.round((loaded / FRAME_COUNT) * 100));
        if (i === 0) render(0);
        if (loaded === FRAME_COUNT) setReady(true);
      };
      img.src = frameUrl(i);
      images[i] = img;
    }
    imagesRef.current = images;
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Crisp, DPR-aware sizing ----
  function resize() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    render(stateRef.current.frame);
  }

  // ---- Draw one frame, "contain"-style and centered. No synthetic contact
  // shadow here: the camera pushes into dramatic close-ups mid-sequence (e.g.
  // the engine-bay reveal), so a shadow fixed to a "ground plane" position
  // would be misaligned half the time. The footage's own shadow, baked in at
  // generation time, carries the grounding instead. ----
  function render(index: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const i = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(index)));
    const img = imagesRef.current[i];
    const cw = canvas.width;
    const ch = canvas.height;
    ctx.fillStyle = PAGE_BG;
    ctx.fillRect(0, 0, cw, ch);
    if (!img || !img.complete || !img.naturalWidth) return;

    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  useEffect(() => {
    window.addEventListener("resize", resize, { passive: true });
    resize();
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Wire the scrub once frames are in ----
  useGSAP(
    () => {
      if (!ready) return;
      resize();
      gsap.to(stateRef.current, {
        frame: FRAME_COUNT - 1,
        ease: "none",
        snap: "frame",
        scrollTrigger: {
          trigger: wrapRef.current,
          start: "top top",
          end: "bottom bottom",
          // Lenis already smooths the raw scroll input with its own inertia;
          // a heavier scrub value here stacks a second layer of lag on top
          // of that, which reads as rubbery/imprecise rather than smooth.
          // Keeping this low lets Lenis do the smoothing and GSAP track it
          // closely, which is what actually feels tight during scrubbing.
          scrub: 0.2,
          invalidateOnRefresh: true,
          onRefresh: resize,
        },
        onUpdate: () => render(stateRef.current.frame),
      });
      // Positions can shift as hero content above decodes — remeasure.
      ScrollTrigger.refresh();
    },
    { scope: wrapRef, dependencies: [ready] }
  );

  return (
    <section
      ref={wrapRef}
      id="reveal"
      className="relative h-[500vh] scroll-mt-20"
      style={{ background: PAGE_BG }}
      data-sequence-root
      data-nav-theme="dark"
    >
      <div className="sequence-stage sticky top-0 h-screen w-full overflow-hidden">
        {/* Car composites directly onto the section background — no card,
            no matte */}
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {/* No mid-scroll captions — they used to sit under the fixed nav
            bar and get clipped. Instead, the section explains itself right
            at the end, fading in below the car. */}
        <RevealClosingCopy sectionRef={wrapRef} />

        {/* Graceful loading fallback */}
        {!ready && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5"
            style={{ background: PAGE_BG }}
          >
            <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-neutral-400/60 border-t-neutral-900 motion-reduce:animate-none" />
            <div className="h-[3px] w-[min(240px,60vw)] overflow-hidden rounded bg-black/15">
              <div
                className="h-full bg-neutral-900 transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs uppercase tracking-[0.15em] text-neutral-800">
              Loading {progress}%
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

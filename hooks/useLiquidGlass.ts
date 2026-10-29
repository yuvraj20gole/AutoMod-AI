"use client";

// NOTE: adjust the import path below to wherever you drop liquidGlass.ts in the
// project (this assumes the `@/` alias with the module at src/lib/liquidGlass.ts).
import { useEffect, useRef, type RefObject } from "react";
import {
  liquidGlass,
  type LiquidGlassOptions,
  type LiquidGlassInstance,
} from "@/lib/liquidGlass";

/**
 * Apply the liquid-glass refraction filter to a ref'd element for its lifetime.
 * Chromium gets real SVG-displacement refraction; Safari/Firefox get a frosted
 * fallback. Options are read once on mount.
 */
export function useLiquidGlass<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options?: LiquidGlassOptions
) {
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let instance: LiquidGlassInstance | null = null;
    // Defer one frame so layout (and border-radius) is settled before we
    // read the element's size to build the displacement map.
    const raf = requestAnimationFrame(() => {
      instance = liquidGlass(el, optsRef.current);
    });
    return () => {
      cancelAnimationFrame(raf);
      instance?.destroy();
    };
  }, [ref]);
}

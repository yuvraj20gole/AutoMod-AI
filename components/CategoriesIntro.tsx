"use client";

import { motion } from "framer-motion";

/**
 * Frames the existing Finish/Stance/Power trio as one deliberate "here's
 * what AutoMod handles" section instead of three disconnected showcase
 * panels — and makes clear this isn't a sports-car-only tool: body kits,
 * paint, wheels, and power mods, tailored to whatever car you actually
 * drive. Same background as Finish so it reads as one continuous section
 * split by an intro.
 */
export default function CategoriesIntro() {
  return (
    <div
      className="bg-[#f5f5f4] px-6 pt-24 pb-6 text-center md:pt-36"
      data-nav-theme="light"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div className="mb-4 flex items-center justify-center gap-3">
          <span className="h-[2px] w-8 rounded bg-amber-600" />
          <span className="text-xs font-medium uppercase tracking-[0.3em] text-amber-600">
            Categories
          </span>
          <span className="h-[2px] w-8 rounded bg-amber-600" />
        </div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
          A preview of what AutoMod AI handles
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-neutral-600 md:text-base">
          Body kits, paint and wraps, wheels and stance, engine and exhaust —
          whether it&apos;s a hot hatch, a daily sedan, or something like this
          GT3 RS. Every recommendation is generated for your car&apos;s
          specific make and model, not a generic template.
        </p>
      </motion.div>
    </div>
  );
}

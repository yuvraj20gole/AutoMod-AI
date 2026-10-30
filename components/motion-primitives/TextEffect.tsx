"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";

/**
 * Small local primitive in the spirit of motion-primitives.com's TextEffect
 * (opacity/y stagger per word, or a single-line reveal). Built directly on
 * Framer Motion rather than pulled from the external site.
 *
 * Defaults to whileInView. Pass inView={false} for content already on screen
 * (e.g. the hero heading).
 *
 * Use per="line" when the text sits inside (or is itself) a
 * background-clip:text / gradient fill — WebKit fails to paint clipped
 * gradients when child spans animate with filter or even when they are
 * separate inline-block boxes under a clipped parent. Line mode keeps the
 * glyphs on the same element as the clip/fill.
 *
 * Never animate `filter`. Framer interpolates blur → blur(0px); WebKit
 * treats that as a real filter box and gradient text vanishes.
 *
 * End state is always opacity:1 and transform:none. CSS class
 * `.text-effect-word` / `.text-effect-line` reinforces that if motion JS
 * never runs.
 */

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const word: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
  },
};

const line: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.25, 0.1, 0.25, 1] },
  },
};

export default function TextEffect({
  children,
  className = "",
  inView = true,
  once = true,
  per = "word",
}: {
  children: string;
  className?: string;
  inView?: boolean;
  once?: boolean;
  /** "line" = one motion node (safe with background-clip:text). */
  per?: "word" | "line";
}) {
  const reduce = useReducedMotion();
  const trigger = inView
    ? { whileInView: "visible" as const, viewport: { once, amount: 0.6 } }
    : { animate: "visible" as const };

  if (per === "line") {
    return (
      <motion.span
        className={`text-effect text-effect-line inline-block ${className}`.trim()}
        variants={line}
        initial={reduce ? false : "hidden"}
        {...(reduce ? { animate: "visible" as const } : trigger)}
        style={reduce ? { opacity: 1, transform: "none" } : undefined}
      >
        {children}
      </motion.span>
    );
  }

  const words = children.split(" ");
  return (
    <motion.span
      className={`text-effect ${className}`.trim()}
      variants={container}
      initial={reduce ? false : "hidden"}
      {...(reduce ? { animate: "visible" as const } : trigger)}
    >
      {words.map((w, i) => (
        <motion.span
          key={i}
          variants={word}
          className="text-effect-word inline-block"
          style={reduce ? { opacity: 1, transform: "none" } : undefined}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </motion.span>
  );
}

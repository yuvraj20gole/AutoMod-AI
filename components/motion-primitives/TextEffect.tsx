"use client";

import { motion, type Variants } from "framer-motion";

/**
 * Small local primitive in the spirit of motion-primitives.com's TextEffect
 * (blur/opacity/y stagger per word). Built directly on Framer Motion rather
 * than pulled from the external site, for polish moments only — not used
 * for the main scroll choreography.
 *
 * Defaults to whileInView (reveals as each heading scrolls into view). Pass
 * inView={false} for content that's already in view at mount — e.g. the
 * hero heading — where a viewport trigger is both unnecessary and, if the
 * element sits inside a GSAP-transformed ancestor, can be unreliable.
 */

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const word: Variants = {
  hidden: { opacity: 0, y: 12, filter: "blur(10px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
  },
};

export default function TextEffect({
  children,
  className = "",
  inView = true,
  once = true,
}: {
  children: string;
  className?: string;
  inView?: boolean;
  once?: boolean;
}) {
  const words = children.split(" ");
  const trigger = inView
    ? { whileInView: "visible" as const, viewport: { once, amount: 0.6 } }
    : { animate: "visible" as const };
  return (
    <motion.span
      className={className}
      variants={container}
      initial="hidden"
      {...trigger}
    >
      {words.map((w, i) => (
        <motion.span key={i} variants={word} className="inline-block">
          {w}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </motion.span>
  );
}

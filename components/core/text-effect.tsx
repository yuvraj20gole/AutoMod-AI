"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useMemo, type ElementType, type ReactNode } from "react";

export type TextEffectPer = "word" | "char" | "line";

export type PresetVariants = {
  container: Variants;
  item: Variants;
};

const DEFAULT_VARIANTS: PresetVariants = {
  container: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
    exit: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
  },
  item: {
    hidden: { opacity: 0, y: 10, filter: "blur(8px)" },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.4 },
    },
    exit: {
      opacity: 0,
      y: -10,
      filter: "blur(8px)",
      transition: { duration: 0.3 },
    },
  },
};

function splitText(text: string, per: TextEffectPer) {
  if (per === "line") return text.split("\n");
  if (per === "char") {
    // Split into words first so whitespace between words survives, then
    // chars within each word — keeps wrapping sane vs. a raw char split.
    return text.split(/(\s+)/);
  }
  return text.split(/(\s+)/);
}

/**
 * Local port of motion-primitives.com's TextEffect: per-word/char/line
 * stagger reveal built on AnimatePresence, driven by a controlled `trigger`
 * boolean (rather than only whileInView) so callers can tie it to their own
 * state — e.g. a scroll-progress threshold — and get a real exit animation
 * when that state flips back to false, not just a one-shot mount reveal.
 */
export function TextEffect({
  children,
  per = "word",
  as: Tag = "p",
  variants,
  className = "",
  segmentWrapperClassName = "",
  trigger = true,
  onAnimationComplete,
}: {
  children: string;
  per?: TextEffectPer;
  as?: ElementType;
  variants?: PresetVariants;
  className?: string;
  segmentWrapperClassName?: string;
  trigger?: boolean;
  onAnimationComplete?: () => void;
}) {
  const v = variants ?? DEFAULT_VARIANTS;

  const segments = useMemo(() => splitText(children, per), [children, per]);

  // `motion()` can't statically infer props for a dynamic ElementType — this
  // is a thin, deliberately loose wrapper, so fall back to a permissive type
  // here rather than fighting framer-motion's generics for a component whose
  // whole point is accepting any tag.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MotionTag = motion.create(Tag as any) as any;

  const content = (
    <MotionTag
      className={className}
      variants={v.container}
      initial="hidden"
      animate="visible"
      exit="exit"
      onAnimationComplete={onAnimationComplete}
    >
      {segments.map((segment, i) => {
        if (per === "char" && !/^\s+$/.test(segment)) {
          return (
            <span className="inline-block" key={i}>
              {segment.split("").map((char, j) => (
                <motion.span
                  className={`inline-block ${segmentWrapperClassName}`}
                  key={j}
                  variants={v.item}
                >
                  {char}
                </motion.span>
              ))}
            </span>
          );
        }
        if (/^\s+$/.test(segment)) {
          return (
            <span aria-hidden key={i} className="inline-block whitespace-pre">
              {segment}
            </span>
          );
        }
        return (
          <motion.span
            className={`inline-block ${segmentWrapperClassName}`}
            key={i}
            variants={v.item}
          >
            {segment}
          </motion.span>
        );
      })}
    </MotionTag>
  );

  return <AnimatePresence mode="wait">{trigger ? (content as ReactNode) : null}</AnimatePresence>;
}

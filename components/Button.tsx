"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";

const SHARED_CLASSES =
  "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-2px_2px_0_rgba(0,0,0,0.15),0_8px_20px_-6px_rgba(0,0,0,0.3)] transition-shadow duration-300 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400";
const DEFAULT_GLOW =
  "hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5),inset_0_-2px_2px_0_rgba(0,0,0,0.18),0_16px_32px_-8px_rgba(0,0,0,0.4),0_0_36px_-6px_rgba(251,191,36,0.65)]";
const SHARED_MOTION = {
  whileHover: { scale: 1.03, y: -2 },
  whileTap: { scale: 0.97, y: 0 },
  transition: { type: "spring" as const, stiffness: 260, damping: 22, mass: 0.9 },
};

/**
 * Single global button/CTA primitive, used everywhere a call-to-action
 * appears. Real 3D bevel (inset highlight top, inset shadow bottom, drop
 * shadow beneath) rather than a flat fill, so it reads as a physical,
 * pressable object — lifts a touch on hover, presses flat on tap, weighted
 * spring physics rather than linear easing so it feels deliberate rather
 * than "gamer" snappy.
 *
 * The bevel/glow shadows are plain CSS box-shadow transitions (Tailwind
 * classes), not framer-animated — box-shadow doesn't interpolate cleanly
 * through framer's spring engine. Only scale/y use the spring.
 *
 * Pass `href` to render as a real anchor (nav CTAs that jump to a page
 * section) instead of a plain `<button>` with nowhere to go.
 */
export default function Button({
  children,
  className = "",
  glowClassName = DEFAULT_GLOW,
  href,
  ...props
}: HTMLMotionProps<"button"> & { glowClassName?: string; href?: string }) {
  const reduce = useReducedMotion();
  const motionProps = reduce
    ? {}
    : { whileHover: SHARED_MOTION.whileHover, whileTap: SHARED_MOTION.whileTap };
  const combinedClassName = `${SHARED_CLASSES} ${glowClassName} ${className}`;

  if (href) {
    return (
      <motion.a
        href={href}
        {...motionProps}
        transition={SHARED_MOTION.transition}
        className={combinedClassName}
        {...(props as HTMLMotionProps<"a">)}
      >
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button
      {...motionProps}
      transition={SHARED_MOTION.transition}
      className={combinedClassName}
      {...props}
    >
      {children}
    </motion.button>
  );
}

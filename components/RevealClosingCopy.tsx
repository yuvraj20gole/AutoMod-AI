"use client";

import { useState, type RefObject } from "react";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { TextEffect, type PresetVariants } from "@/components/core/text-effect";

// Same blur/brightness stagger as motion-primitives' TextEffectWithExit
// demo, but `trigger` is driven by our own scroll-progress threshold below
// instead of a setInterval — it plays the enter animation once the
// rotation settles on its final frame, and reverses if you scroll back up
// past that point.
const blurSlideVariants: PresetVariants = {
  container: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.01 } },
    exit: { transition: { staggerChildren: 0.01, staggerDirection: 1 } },
  },
  item: {
    hidden: { opacity: 0, filter: "blur(10px) brightness(0%)", y: 0 },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px) brightness(100%)",
      transition: { duration: 0.4 },
    },
    exit: {
      opacity: 0,
      y: -30,
      filter: "blur(10px) brightness(0%)",
      transition: { duration: 0.4 },
    },
  },
};

/**
 * The statement that used to be its own separate section right after Reveal
 * ("AutoMod AI / See the mod before you spend a rupee. / Upload a photo...")
 * now appears here instead, revealing below the car right as the rotation
 * settles on its final frame — so the sequence ends by explaining itself
 * rather than handing off to a near-duplicate section immediately after.
 * Bottom-anchored (not top) so it never sits under the fixed nav bar the
 * way the old mid-scroll captions did.
 */
export default function RevealClosingCopy({
  sectionRef,
}: {
  sectionRef: RefObject<HTMLDivElement | null>;
}) {
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const [revealed, setRevealed] = useState(false);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setRevealed((prev) => {
      const next = v >= 0.88;
      return prev === next ? prev : next;
    });
  });

  return (
    <motion.div
      animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 20 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-6 pb-[8vh] pt-[16vh] text-center"
    >
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/65 via-black/25 to-transparent" />
      <div className="mb-3 flex items-center justify-center gap-3">
        <span className="h-[2px] w-8 rounded bg-amber-400" />
        <span className="text-xs font-medium uppercase tracking-[0.3em] text-amber-400">
          AutoMod AI
        </span>
        <span className="h-[2px] w-8 rounded bg-amber-400" />
      </div>
      <TextEffect
        as="h2"
        per="char"
        variants={blurSlideVariants}
        trigger={revealed}
        className="font-display flex max-w-xl flex-wrap justify-center text-2xl font-semibold tracking-tight text-neutral-50 md:text-4xl"
      >
        See the mod before you spend a rupee.
      </TextEffect>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-neutral-300 md:text-base">
        Upload a photo of your car, get AI-recommended modifications, and
        preview the finished look in photorealistic detail — before you ever
        set foot in a shop.
      </p>
    </motion.div>
  );
}

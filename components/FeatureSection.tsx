"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import TextEffect from "./motion-primitives/TextEffect";

type Theme = "light" | "dark" | "dark-warm";

// The amber/gold accent is the site's one signature color, used the same
// way in every section: eyebrow label + its divider dash. Shade varies
// slightly for contrast depending on background, but it's the same hue
// throughout — everything else stays black/white/gray.
const THEME_STYLES: Record<
  Theme,
  {
    bg: string;
    tag: string;
    dash: string;
    heading: string;
    body: string;
    imgBg: string;
    glow: string;
  }
> = {
  light: {
    bg: "bg-[#f5f5f4]",
    tag: "text-amber-600",
    dash: "bg-amber-600",
    heading: "text-neutral-900",
    body: "text-neutral-600",
    imgBg: "bg-[#e4e4e2]",
    glow: "rgba(217,119,6,0.12)",
  },
  dark: {
    bg: "bg-neutral-950",
    tag: "text-amber-400",
    dash: "bg-amber-400",
    heading: "text-neutral-50",
    body: "text-neutral-400",
    imgBg: "bg-neutral-900",
    glow: "rgba(251,191,36,0.16)",
  },
  "dark-warm": {
    bg: "bg-neutral-950",
    tag: "text-amber-400",
    dash: "bg-amber-400",
    heading: "text-neutral-50",
    body: "text-neutral-400",
    imgBg: "bg-neutral-900",
    glow: "rgba(255,140,40,0.18)",
  },
};

export default function FeatureSection({
  id,
  tag,
  title,
  body,
  img,
  alt,
  theme = "light",
  mirrored = false,
}: {
  id?: string;
  tag: string;
  title: string;
  body: string;
  img: string;
  alt: string;
  theme?: Theme;
  mirrored?: boolean;
}) {
  const s = THEME_STYLES[theme];
  const isWarm = theme === "dark-warm";
  const slideFrom = mirrored ? 32 : -32;
  const navTheme = theme === "light" ? "light" : "dark";

  return (
    <section
      id={id}
      className={`relative scroll-mt-20 overflow-hidden px-6 py-24 md:py-32 ${s.bg}`}
      data-nav-theme={navTheme}
    >
      <div
        className="pointer-events-none absolute -z-10 h-[55vmin] w-[55vmin] rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${s.glow} 0%, transparent 70%)`,
          [mirrored ? "left" : "right"]: "-10vmin",
          top: isWarm ? "50%" : "10%",
          transform: isWarm ? "translateY(-50%)" : undefined,
        }}
        aria-hidden
      />
      <div className="mx-auto max-w-6xl">
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
          {/* Copy column */}
          <motion.div
            className={mirrored ? "md:order-2" : "md:order-1"}
            initial={{ opacity: 0, x: slideFrom }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="flex items-center gap-3">
              <span className={`h-[2px] w-10 rounded ${s.dash}`} />
              <span
                className={`text-xs font-medium uppercase tracking-[0.25em] ${s.tag}`}
              >
                {tag}
              </span>
            </div>
            <h3
              className={`font-display mt-4 text-3xl font-semibold tracking-tight md:text-5xl ${s.heading}`}
            >
              <TextEffect>{title}</TextEffect>
            </h3>
            <p className={`mt-4 max-w-md text-base leading-relaxed md:text-lg ${s.body}`}>
              {body}
            </p>
          </motion.div>

          {/* Image column — sticky so it holds in place if the copy runs
              taller than the viewport; static single image, gentle hover
              zoom is the only motion (no crossfade). */}
          <motion.div
            className={mirrored ? "md:order-1" : "md:order-2"}
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
          >
            <div className="md:sticky md:top-24">
              <div
                className={`group relative aspect-[16/10] w-full overflow-hidden rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35)] ring-1 ring-black/5 ${s.imgBg}`}
              >
                <Image
                  src={img}
                  alt={alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

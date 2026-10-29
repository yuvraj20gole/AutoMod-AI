"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import TextEffect from "./motion-primitives/TextEffect";
import Button from "./Button";

const TRUST_ITEMS = [
  "AI-recommended mods",
  "Photorealistic previews",
  "Built for Indian roads",
];

const FOOTER_LINKS = [
  { href: "#top", label: "Home" },
  { href: "#how-it-works", label: "How it Works" },
  { href: "#finish", label: "Mods" },
];

export default function ClosingCTA() {
  return (
    <>
      <section
        id="get-started"
        className="relative scroll-mt-20 overflow-hidden bg-[#f5f5f4] px-6 py-28 md:py-36"
        data-nav-theme="light"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage:
              "radial-gradient(ellipse 60% 60% at 50% 40%, black 30%, transparent 100%)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-[55vmin] w-[55vmin] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.16)_0%,transparent_70%)] blur-3xl"
          aria-hidden
        />

        <motion.div
          className="relative mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div className="mb-4 flex items-center justify-center gap-3">
            <span className="h-[2px] w-8 rounded bg-amber-600" />
            <span className="text-xs font-medium uppercase tracking-[0.3em] text-amber-600">
              AutoMod AI
            </span>
            <span className="h-[2px] w-8 rounded bg-amber-600" />
          </div>
          <h2 className="font-display text-4xl font-semibold tracking-tight text-neutral-900 md:text-6xl">
            <TextEffect>Your build starts here.</TextEffect>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base text-neutral-600 md:text-lg">
            No shop visit required — just your car and a few minutes.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button className="rounded-full bg-neutral-900 px-7 py-3 text-sm font-medium text-neutral-50">
              Start your build →
            </Button>
            <Button
              href="#how-it-works"
              glowClassName="hover:border-neutral-400 hover:text-neutral-900"
              className="rounded-full border border-neutral-300 bg-transparent px-7 py-3 text-sm font-medium text-neutral-700 shadow-none"
            >
              See how it works
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium uppercase tracking-[0.15em] text-neutral-500">
            {TRUST_ITEMS.map((item) => (
              <span className="flex items-center gap-2" key={item}>
                <span className="h-1 w-1 rounded-full bg-amber-500" />
                {item}
              </span>
            ))}
          </div>
        </motion.div>
      </section>

      <footer className="bg-neutral-950 px-6 py-10" data-nav-theme="dark">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <a className="flex items-center gap-2" href="#top">
            <Image src="/logo-icon.png" alt="" width={354} height={219} className="h-4 w-auto" />
            <span className="font-display text-sm font-bold tracking-tight text-neutral-50">
              AUTOMOD <span className="text-amber-400">AI</span>
            </span>
          </a>

          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-neutral-400">
            {FOOTER_LINKS.map((link) => (
              <a
                className="transition-colors hover:text-neutral-50"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <span className="text-xs text-neutral-500">
            © 2026 AutoMod AI. All rights reserved.
          </span>
        </div>
      </footer>
    </>
  );
}

"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import CompareSlider from "@/components/studio/CompareSlider";

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Shared "app window" chrome the step visuals sit inside — a plain
 * rounded card with a thin dotted title bar, so each step reads as one
 * consistent UI rather than four unrelated graphics. */
function MockupFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_30px_70px_-25px_rgba(0,0,0,0.25)]">
      <div className="flex items-center gap-1.5 border-b border-neutral-100 px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-neutral-200" />
        <span className="h-2 w-2 rounded-full bg-neutral-200" />
        <span className="h-2 w-2 rounded-full bg-neutral-200" />
      </div>
      <div className="relative flex h-[calc(100%-38px)] items-center justify-center p-6">
        {children}
      </div>
    </div>
  );
}

function UploadVisual() {
  return (
    <MockupFrame>
      <div className="relative h-full w-full overflow-hidden rounded-xl">
        <Image
          src="/landing/corolla-front34-original.jpg"
          alt="Original photo of a silver Toyota Corolla Altis from the front three-quarter angle"
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
        />
        <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
          Toyota Corolla Altis · front 3/4 · detected automatically
        </span>
      </div>
    </MockupFrame>
  );
}

function PickVisual() {
  return (
    <MockupFrame>
      <div className="relative h-full w-full overflow-hidden rounded-xl bg-neutral-100">
        <Image
          src="/landing/how-studio.webp"
          alt="AutoMod AI Studio with Detailed engine selected, choosing a lip spoiler on a 2018 Toyota Corolla"
          width={1120}
          height={700}
          sizes="(max-width: 768px) 100vw, 560px"
          className="h-full w-full object-cover object-top"
          quality={90}
        />
      </div>
    </MockupFrame>
  );
}

function SeeItVisual() {
  return (
    <div>
      <MockupFrame>
        <CompareSlider
          beforeUrl="/landing/corolla-front34-original.jpg"
          afterUrl="/landing/corolla-front34-candy-red.jpg"
          alt="Toyota Corolla Altis repainted in candy red"
        />
      </MockupFrame>
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-[0_20px_50px_-25px_rgba(0,0,0,0.25)]">
        <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg">
          <Image
            src="/landing/corolla-front34-matte-black.jpg"
            alt="The same Toyota Corolla Altis with a matte black wrap"
            fill
            sizes="80px"
            className="object-cover"
          />
        </div>
        <p className="text-sm leading-relaxed text-neutral-600">
          <span className="font-medium text-neutral-900">Prefer subtle?</span>{" "}
          The same car in a matte black wrap — switch finishes without
          re-uploading.
        </p>
      </div>
    </div>
  );
}

function AdviceVisual() {
  return (
    <MockupFrame>
      <div className="relative h-full w-full overflow-hidden rounded-xl bg-neutral-100">
        <Image
          src="/landing/how-advisor.webp"
          alt="Upgrade Advisor chat recommending parts for a 2018 Toyota Corolla under a ₹50,000 budget"
          width={1400}
          height={875}
          sizes="(max-width: 768px) 100vw, 560px"
          className="h-full w-full object-cover object-top"
          quality={90}
        />
      </div>
    </MockupFrame>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Upload your car",
    body: "Add a front, rear or side photo — the car and the angle are detected automatically.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M12 15V4" />
        <path d="M7.5 8.5 12 4l4.5 4.5" />
        <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
      </svg>
    ),
    visual: <UploadVisual />,
  },
  {
    n: "02",
    title: "Pick a modification",
    body: "Paint, wrap, wheels, hood or spoiler — pick a finish and we handle the masking.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="10" cy="17" r="2" />
      </svg>
    ),
    visual: <PickVisual />,
  },
  {
    n: "03",
    title: "See it on your car",
    body: "A photorealistic preview on your own photo — drag the slider to compare before and after.",
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
        <circle cx="8.5" cy="9.5" r="1.2" fill="currentColor" stroke="none" />
        <path d="M4 16l4.5-4.5 3 3L16 10l4.5 5.5" />
      </svg>
    ),
    visual: <SeeItVisual />,
  },
  {
    n: "04",
    title: "Get upgrade advice",
    body: "Type what you want in plain words and get parts that fit your car, engine and budget.",
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" />
        <path d="M8.5 11h7M8.5 14h4" />
      </svg>
    ),
    visual: <AdviceVisual />,
  },
];

/**
 * The live product flow with real output: Corolla photos/renders in
 * public/landing/, Studio and Advisor screenshots for steps 2 and 4, and
 * the Studio CompareSlider for step 3.
 */
export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative scroll-mt-20 overflow-hidden bg-[#f5f5f4] px-6 py-24 md:py-36"
      data-nav-theme="light"
    >
      <div
        className="pointer-events-none absolute -right-24 top-0 h-[45vmin] w-[45vmin] rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.16)_0%,transparent_70%)] blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-24 bottom-0 h-[40vmin] w-[40vmin] rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.1)_0%,transparent_70%)] blur-2xl"
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div className="mb-4 flex items-center justify-center gap-3">
            <span className="h-[2px] w-8 rounded bg-amber-600" />
            <span className="text-xs font-medium uppercase tracking-[0.3em] text-amber-600">
              How it works
            </span>
            <span className="h-[2px] w-8 rounded bg-amber-600" />
          </div>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-neutral-900 md:text-5xl">
            From your car to a finished look
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base text-neutral-600 md:text-lg">
            Four steps, using a real Corolla Altis and real renders from the
            engine — no stock photos.
          </p>
        </motion.div>

        <div className="mt-20 flex flex-col gap-20 md:gap-28">
          {STEPS.map((step, i) => {
            const mirrored = i % 2 === 1;
            return (
              <div
                className="grid items-center gap-10 md:grid-cols-2 md:gap-16"
                key={step.n}
              >
                <motion.div
                  className={mirrored ? "md:order-2" : "md:order-1"}
                  initial={{ opacity: 0, x: mirrored ? 32 : -32 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-400/50 bg-[#f5f5f4] text-amber-600">
                      <span className="h-5 w-5">{step.icon}</span>
                    </div>
                    <span className="font-display text-3xl font-semibold text-amber-500/60">
                      {step.n}
                    </span>
                  </div>
                  <h3 className="mt-4 text-2xl font-semibold text-neutral-900 md:text-3xl">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-sm text-base leading-relaxed text-neutral-600">
                    {step.body}
                  </p>
                </motion.div>

                <motion.div
                  className={mirrored ? "md:order-1" : "md:order-2"}
                  initial={{ opacity: 0, scale: 0.94 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
                >
                  {step.visual}
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

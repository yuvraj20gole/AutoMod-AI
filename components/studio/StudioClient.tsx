"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MOD_CATEGORIES,
  canCompareEngines,
  compareEtaMinutes,
  counterpartMod,
  visibleCategories,
  visibleOptions,
  type EditEngine,
  type ModCategory,
} from "@/lib/mods";
import { ANGLE_LABEL, neededAnglesText, pickPhotoForMod, type PhotoAngle } from "@/lib/angles";
import CompareSlider from "./CompareSlider";

export type StudioPhoto = { id: string; angle: PhotoAngle; url: string };

type Result = {
  afterUrl: string;
  buildId: string;
  model: string;
  engine: EditEngine;
  seconds?: number;
};

type EngineInfo = {
  id: string;
  label: string;
  ready: boolean;
  reason?: string | null;
  eta?: string;
};

type JobPhase = "queued" | "running" | null;

type CompareState = {
  originalUrl: string;
  fast?: Result | null;
  detailed?: Result | null;
  error?: string | null;
  running?: EditEngine | null;
};

export default function StudioClient({
  carId,
  carName,
  photos,
}: {
  carId: string;
  carName: string;
  photos: StudioPhoto[];
}) {
  const [engine, setEngine] = useState<EditEngine>("fast");
  const [engines, setEngines] = useState<{ fast?: EngineInfo; detailed?: EngineInfo }>({});
  const cats = visibleCategories(engine);
  const [category, setCategory] = useState<ModCategory>(cats[0]?.key ?? "paint");
  const [option, setOption] = useState<string>(
    cats[0] ? visibleOptions(cats[0], engine)[0]?.key ?? "" : ""
  );
  const [loading, setLoading] = useState(false);
  const [jobPhase, setJobPhase] = useState<JobPhase>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [compare, setCompare] = useState<CompareState | null>(null);
  const [compareConfirm, setCompareConfirm] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const config = MOD_CATEGORIES.find((c) => c.key === category)!;
  const options = visibleOptions(config, engine);
  const autoPhoto = pickPhotoForMod(category, photos);
  const activePhoto = autoPhoto;
  const photoUrl = (activePhoto ?? photos[0]).url;
  const showCompare =
    !!result && !compare && canCompareEngines(category, option) && !loading;

  useEffect(() => {
    fetch("/api/engines")
      .then((r) => r.json())
      .then(setEngines)
      .catch(() => {});
  }, []);

  // Clear selection when engine changes if option is invalid.
  useEffect(() => {
    const nextCats = visibleCategories(engine);
    const stillValidCat = nextCats.some((c) => c.key === category);
    const nextCat = stillValidCat ? category : nextCats[0]?.key;
    if (!nextCat) return;
    const cfg = MOD_CATEGORIES.find((c) => c.key === nextCat)!;
    const opts = visibleOptions(cfg, engine);
    const stillValidOpt = opts.some((o) => o.key === option);
    if (!stillValidCat) setCategory(nextCat);
    if (!stillValidOpt) setOption(opts[0]?.key ?? "");
    setResult(null);
    setCompare(null);
    setCompareConfirm(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check when engine flips
  }, [engine]);

  const stopTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    timerRef.current = null;
    pollRef.current = null;
  }, []);

  useEffect(() => () => stopTimers(), [stopTimers]);

  function pickCategory(next: ModCategory) {
    const cfg = MOD_CATEGORIES.find((c) => c.key === next)!;
    setCategory(next);
    setOption(visibleOptions(cfg, engine)[0]?.key ?? "");
    setResult(null);
    setCompare(null);
    setCompareConfirm(false);
    setError(null);
  }

  function pickEngine(next: EditEngine) {
    if (next === "detailed" && engines.detailed && !engines.detailed.ready) return;
    setEngine(next);
  }

  async function runFast(modCategory: ModCategory, modOption: string): Promise<Result> {
    const started = Date.now();
    const res = await fetch("/api/builds/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        carId,
        category: modCategory,
        option: modOption,
        photoId: activePhoto?.id,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.afterUrl) {
      throw new Error(data.error ?? "Fast edit failed");
    }
    return {
      afterUrl: data.afterUrl,
      buildId: data.buildId,
      model: data.model ?? "instruct-pix2pix",
      engine: "fast",
      seconds: Math.round((Date.now() - started) / 1000),
    };
  }

  async function runDetailed(modCategory: ModCategory, modOption: string): Promise<Result> {
    setJobPhase("queued");
    setElapsedSec(0);
    const started = Date.now();
    timerRef.current = setInterval(() => setElapsedSec(Math.floor((Date.now() - started) / 1000)), 1000);

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        carId,
        category: modCategory,
        option: modOption,
        photoId: activePhoto?.id,
        engine: "detailed",
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.jobId) {
      stopTimers();
      setJobPhase(null);
      throw new Error(data.error ?? "Could not queue the Detailed edit.");
    }

    const jobId = data.jobId as string;
    const beforePath = data.beforePath as string;

    return await new Promise<Result>((resolve, reject) => {
      const poll = async () => {
        try {
          const qs = new URLSearchParams({
            beforePath,
            carId,
            category: modCategory,
            option: modOption,
          });
          const st = await fetch(`/api/jobs/${jobId}?${qs}`);
          const body = await st.json();
          if (!st.ok) {
            stopTimers();
            setJobPhase(null);
            reject(new Error(body.error ?? "Status check failed"));
            return;
          }
          if (body.status === "queued") setJobPhase("queued");
          if (body.status === "running") setJobPhase("running");
          if (body.status === "failed") {
            stopTimers();
            setJobPhase(null);
            reject(new Error(body.error ?? "Detailed edit failed"));
            return;
          }
          if (body.status === "done" && body.afterUrl) {
            stopTimers();
            setJobPhase(null);
            resolve({
              afterUrl: body.afterUrl,
              buildId: body.buildId,
              model: "qwen-image-edit-2511-q4",
              engine: "detailed",
              seconds: Math.round((Date.now() - started) / 1000),
            });
          }
        } catch (e) {
          stopTimers();
          setJobPhase(null);
          reject(e instanceof Error ? e : new Error("Lost connection while waiting."));
        }
      };

      void poll();
      pollRef.current = setInterval(poll, 3000);
    });
  }

  async function generateFast() {
    setLoading(true);
    setError(null);
    setCompare(null);
    try {
      const r = await runFast(category, option);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function generateDetailed() {
    setLoading(true);
    setError(null);
    setCompare(null);
    try {
      const r = await runDetailed(category, option);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server.");
    } finally {
      setLoading(false);
      setJobPhase(null);
      stopTimers();
    }
  }

  function generate() {
    if (engine === "detailed") return generateDetailed();
    return generateFast();
  }

  async function startCompare() {
    if (!result) return;
    const other: EditEngine = result.engine === "fast" ? "detailed" : "fast";
    if (other === "detailed" && engines.detailed && !engines.detailed.ready) {
      setError(engines.detailed.reason ?? "Detailed engine unavailable");
      setCompareConfirm(false);
      return;
    }
    const counterpart = counterpartMod(category, option, other);
    if (!counterpart) {
      setError("This part is not available on the other engine.");
      setCompareConfirm(false);
      return;
    }

    setCompareConfirm(false);
    setLoading(true);
    setError(null);
    const base: CompareState = {
      originalUrl: photoUrl,
      fast: result.engine === "fast" ? result : null,
      detailed: result.engine === "detailed" ? result : null,
      running: other,
      error: null,
    };
    setCompare(base);

    try {
      // Same shared queue — never concurrent with the first result's engine.
      const second =
        other === "detailed"
          ? await runDetailed(counterpart.category as ModCategory, counterpart.option)
          : await runFast(counterpart.category as ModCategory, counterpart.option);
      setCompare({
        ...base,
        running: null,
        fast: other === "fast" ? second : base.fast,
        detailed: other === "detailed" ? second : base.detailed,
      });
      setResult(second);
    } catch (e) {
      setCompare({
        ...base,
        running: null,
        error: e instanceof Error ? e.message : "Compare failed",
      });
    } finally {
      setLoading(false);
      setJobPhase(null);
      stopTimers();
    }
  }

  const detailedDisabled = engines.detailed ? !engines.detailed.ready : false;
  const progressLabel =
    jobPhase === "queued"
      ? "Queued — waiting for the previous edit to finish…"
      : jobPhase === "running"
        ? `Running Detailed edit… ${elapsedSec}s (about 4 minutes)`
        : loading
          ? "Generating your preview. This can take a minute."
          : null;

  const eta = result ? compareEtaMinutes(result.engine) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        {compare ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <figure className="overflow-hidden rounded-2xl bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={compare.originalUrl} alt="Original" className="block w-full" />
                <figcaption className="px-3 py-2 text-xs text-neutral-600">Original</figcaption>
              </figure>
              <figure className="overflow-hidden rounded-2xl bg-neutral-100">
                {compare.fast ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={compare.fast.afterUrl} alt="Fast" className="block w-full" />
                ) : (
                  <div className="flex aspect-[3/2] items-center justify-center text-xs text-neutral-500">
                    {compare.running === "fast" ? "Running Fast…" : "—"}
                  </div>
                )}
                <figcaption className="px-3 py-2 text-xs text-neutral-600">
                  Fast
                  {compare.fast
                    ? `: ${compare.fast.model}${compare.fast.seconds != null ? ` · ${compare.fast.seconds}s` : ""}`
                    : ""}
                </figcaption>
              </figure>
              <figure className="overflow-hidden rounded-2xl bg-neutral-100">
                {compare.detailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={compare.detailed.afterUrl} alt="Detailed" className="block w-full" />
                ) : (
                  <div className="flex aspect-[3/2] items-center justify-center text-xs text-neutral-500">
                    {compare.running === "detailed" ? progressLabel ?? "Running Detailed…" : "—"}
                  </div>
                )}
                <figcaption className="px-3 py-2 text-xs text-neutral-600">
                  Detailed
                  {compare.detailed
                    ? `: ${compare.detailed.model}${
                        compare.detailed.seconds != null ? ` · ${compare.detailed.seconds}s` : ""
                      }`
                    : ""}
                </figcaption>
              </figure>
            </div>
            {compare.error && (
              <p className="text-sm text-amber-800">
                One engine failed: {compare.error}. Showing whatever completed.
              </p>
            )}
            <button
              type="button"
              onClick={() => setCompare(null)}
              className="text-xs font-medium text-neutral-600 underline hover:text-neutral-900"
            >
              Back to before/after slider
            </button>
          </div>
        ) : result ? (
          <CompareSlider beforeUrl={photoUrl} afterUrl={result.afterUrl} alt={carName} />
        ) : (
          <div className="relative overflow-hidden rounded-2xl bg-neutral-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt={carName} className="block w-full" />
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-sm">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-amber-500" />
                <p className="max-w-xs text-center text-sm text-neutral-700">{progressLabel}</p>
              </div>
            )}
          </div>
        )}
        {result && !compare && (
          <p className="mt-3 text-xs text-neutral-500">
            Saved to{" "}
            <Link href="/dashboard/builds" className="font-medium text-amber-700 hover:underline">
              My Builds
            </Link>
            . Drag the slider to compare. Engine: {result.engine === "detailed" ? "Detailed" : "Fast"} (
            {result.model}
            {result.seconds != null ? ` · ${result.seconds}s` : ""}).
          </p>
        )}
      </div>

      <aside className="space-y-6">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Model</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => pickEngine("fast")}
              disabled={loading}
              className={`rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors ${
                engine === "fast"
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 text-neutral-700 hover:border-neutral-500"
              }`}
            >
              <span className="font-medium">Fast</span>
              <span className={`mt-0.5 block text-xs ${engine === "fast" ? "text-neutral-300" : "text-neutral-500"}`}>
                About 1–2 min, keeps your photo exact
              </span>
            </button>
            <button
              type="button"
              onClick={() => pickEngine("detailed")}
              disabled={loading || detailedDisabled}
              title={detailedDisabled ? engines.detailed?.reason ?? "Unavailable" : undefined}
              className={`rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors disabled:opacity-50 ${
                engine === "detailed"
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 text-neutral-700 hover:border-neutral-500"
              }`}
            >
              <span className="font-medium">Detailed</span>
              <span
                className={`mt-0.5 block text-xs ${engine === "detailed" ? "text-neutral-300" : "text-neutral-500"}`}
              >
                {detailedDisabled
                  ? engines.detailed?.reason ?? "Unavailable on this Mac"
                  : "About 4 min, adds new body parts"}
              </span>
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Modification</p>
          <div className="flex flex-wrap gap-2">
            {visibleCategories(engine).map((c) => (
              <button
                key={c.key}
                onClick={() => pickCategory(c.key)}
                disabled={loading}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                  c.key === category
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 text-neutral-700 hover:border-neutral-500"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">{config?.hint}</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Style</p>
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <button
                key={o.key}
                onClick={() => {
                  setOption(o.key);
                  setResult(null);
                  setCompare(null);
                  setCompareConfirm(false);
                  setError(null);
                }}
                disabled={loading}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  o.key === option
                    ? "border-amber-500 bg-amber-50 text-neutral-900"
                    : "border-neutral-300 text-neutral-700 hover:border-neutral-500"
                }`}
              >
                {o.swatch && (
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-black/10"
                    style={{ background: o.swatch }}
                  />
                )}
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {activePhoto ? (
          <p className="flex items-center gap-2 text-xs text-neutral-600">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activePhoto.url} alt="" className="h-8 w-12 rounded-md object-cover" />
            Using your {ANGLE_LABEL[activePhoto.angle]} photo for this mod.
          </p>
        ) : (
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            This mod needs a {neededAnglesText(category)} photo. Add one from My Cars (Manage photos) to
            use it.
          </p>
        )}

        <button
          onClick={generate}
          disabled={loading || !activePhoto || (engine === "detailed" && detailedDisabled)}
          className="w-full rounded-full bg-neutral-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
        >
          {loading ? "Generating…" : result ? "Generate again" : "Generate preview"}
        </button>

        {showCompare && (
          <div className="space-y-2">
            {!compareConfirm ? (
              <button
                type="button"
                onClick={() => setCompareConfirm(true)}
                className="w-full rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-800 hover:border-neutral-500"
              >
                Compare engines
              </button>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-medium">{eta?.note}</p>
                <p className="mt-1 text-xs text-amber-800">
                  Runs the other engine next (one job at a time). Both results are saved to My Builds.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={startCompare}
                    className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white"
                  >
                    Start compare
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareConfirm(false)}
                    className="rounded-full px-4 py-1.5 text-xs text-neutral-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </aside>
    </div>
  );
}

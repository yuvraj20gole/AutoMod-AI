/** Shown in Studio when Fast/Detailed are unreachable (e.g. hosted showcase). */
export const EDITING_OFFLINE_MESSAGE =
  "Editing engines run locally. Saved builds are still available.";

export type EngineReadyInfo = {
  id?: string;
  label?: string;
  ready?: boolean;
  reason?: string | null;
};

/** True when no edit engine reports ready — includes empty/unset engines state. */
export function isEditingOffline(engines: {
  fast?: EngineReadyInfo | null;
  detailed?: EngineReadyInfo | null;
} | null | undefined): boolean {
  return !engines?.fast?.ready && !engines?.detailed?.ready;
}

export function offlineEnginesPayload(reason = EDITING_OFFLINE_MESSAGE) {
  return {
    fast: { id: "fast" as const, label: "Fast", ready: false, reason },
    detailed: { id: "detailed" as const, label: "Detailed", ready: false, reason },
  };
}

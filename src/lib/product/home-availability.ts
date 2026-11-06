export const homeSources = ["providers", "bills", "care", "records", "resolutions", "billEvents", "items", "issues", "activity", "household"] as const;
export type HomeSource = typeof homeSources[number];
export function homeAvailability(failures: readonly HomeSource[], supportsPartial: boolean) {
  const missing = [...new Set(failures)];
  return {
    missing,
    complete: missing.length === 0,
    // Older clients do not know how to distinguish unavailable from empty.
    reject: missing.length > 0 && (!supportsPartial || missing.length === homeSources.length),
    canShowAttention: !missing.includes("resolutions"),
  };
}

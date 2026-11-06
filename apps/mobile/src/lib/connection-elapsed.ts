/** Elapsed time, never a countdown or a claimed completion percentage. */
export function formatConnectionElapsed(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(milliseconds) ? milliseconds / 1000 : 0));
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}

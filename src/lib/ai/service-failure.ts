/** Classify provider capacity errors without returning prompts, headers or provider bodies. */
export function isProviderCreditExhausted(error: unknown): boolean {
  const visited = new Set<unknown>();
  function inspect(value: unknown, depth: number): boolean {
    if (!value || typeof value !== "object" || depth > 6 || visited.has(value)) return false;
    visited.add(value);
    const e = value as Record<string, unknown>;
    if (e.code === "credit_balance_exhausted" || e.code === "insufficient_quota") return true;
    if (typeof e.responseBody === "string" && e.responseBody.length < 20000) {
      try { if (inspect(JSON.parse(e.responseBody), depth + 1)) return true; } catch { /* Not a structured provider error. */ }
    }
    return inspect(e.error, depth + 1) || inspect(e.cause, depth + 1) || (Array.isArray(e.errors) && e.errors.slice(0, 5).some(v => inspect(v, depth + 1)));
  }
  return inspect(error, 0);
}
export const AI_CREDIT_MESSAGE = "AI help is temporarily at capacity. Your saved records and manual tools remain available. Please try again later.";

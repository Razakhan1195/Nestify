/** Strict allowlist: diagnostics contain code locations, never customer context. */
type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue => v && typeof v === "object" && !Array.isArray(v) ? v as RecordValue : {};
const codeName = (v: unknown) => typeof v === "string" && /^[a-zA-Z_$][a-zA-Z0-9_$.:<> -]{0,159}$/.test(v) ? v : undefined;
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : undefined;
function filename(v: unknown) {
  if (typeof v !== "string") return undefined;
  const base = v.split(/[?#]/)[0].split(/[/\\]/).at(-1);
  return base && /^[a-zA-Z0-9_.-]{1,120}$/.test(base) ? base : undefined;
}
function stack(v: unknown) {
  const frames = record(v).frames;
  if (!Array.isArray(frames)) return undefined;
  return { frames: frames.slice(-100).map(raw => {
    const f = record(raw);
    return { filename: filename(f.filename), function: codeName(f.function), lineno: number(f.lineno),
      colno: number(f.colno), in_app: typeof f.in_app === "boolean" ? f.in_app : undefined };
  }) };
}
export function scrubCrashEvent(input: unknown): RecordValue | null {
  const event = record(input);
  if (event.type && event.type !== "error") return null;
  const exceptions = record(event.exception).values;
  if (!Array.isArray(exceptions) || !exceptions.length) return null;
  return {
    event_id: typeof event.event_id === "string" && /^[a-f0-9]{32}$/i.test(event.event_id) ? event.event_id : undefined,
    timestamp: number(event.timestamp), platform: "javascript",
    level: event.level === "fatal" ? "fatal" : "error",
    release: typeof event.release === "string" && /^com\.rezlee\.app@[0-9.]+\+[0-9]+$/.test(event.release) ? event.release : undefined,
    dist: typeof event.dist === "string" && /^\d{1,8}$/.test(event.dist) ? event.dist : undefined,
    environment: ["staging", "production"].includes(String(event.environment)) ? event.environment : undefined,
    debug_meta: { images: (Array.isArray(record(event.debug_meta).images) ? record(event.debug_meta).images as unknown[] : []).flatMap(raw => {
      const image = record(raw);
      return image.type === "sourcemap" && typeof image.debug_id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(image.debug_id)
        ? [{ type: "sourcemap", debug_id: image.debug_id, code_file: filename(image.code_file) }] : [];
    }) },
    exception: { values: exceptions.slice(-5).map(raw => {
      const e = record(raw), mechanism = record(e.mechanism);
      return { type: ["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError"].includes(String(e.type)) ? e.type : "Error",
        value: "Error details removed for privacy", stacktrace: stack(e.stacktrace),
        mechanism: { type: "generic", handled: mechanism.handled !== false } };
    }) },
  };
}

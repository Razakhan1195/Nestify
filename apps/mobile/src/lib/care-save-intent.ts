export type SaveIntent = { fingerprint: string; requestId: string };
// This non-secret digest only recognizes an unchanged local draft. The server
// independently compares the full payload and scopes every key to its owner.
export function careDraftFingerprint(value: unknown) {
  const input = JSON.stringify(value);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < input.length; i++) { a = Math.imul(a ^ input.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ input.charCodeAt(i); }
  return `${input.length}-${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}
export function reuseCareIntent(previous: SaveIntent | null, fingerprint: string, newId: () => string): SaveIntent {
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, requestId: newId() };
}

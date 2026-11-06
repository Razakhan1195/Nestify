import { normalizeRecalls, type Recall } from "./matching";
const FEED = "https://recalls-rappels.canada.ca/sites/default/files/opendata-donneesouvertes/HCRSAMOpenData.json";
type Snapshot = { recalls: Recall[]; checkedAt: string };
let cached: Snapshot | null = null;
let pending: Promise<Snapshot> | null = null;

/** One bounded retry for transport failures and temporary source errors. */
export async function fetchRecallSnapshot(request: typeof fetch = fetch): Promise<Snapshot> {
  let text: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    let retryable = true;
    try {
      const response = await request(FEED, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
      if (!response.ok) {
        retryable = response.status >= 500 || response.status === 408 || response.status === 429;
        throw new Error("Recall source unavailable");
      }
      text = await response.text();
      break;
    } catch (error) {
      if (!retryable || attempt === 1) throw error;
    }
  }
  if (text === undefined) throw new Error("Recall source unavailable");
  if (text.length > 30_000_000) throw new Error("Recall source too large");
  const recalls = normalizeRecalls(JSON.parse(text));
  if (!recalls.length) throw new Error("Recall source empty");
  return { recalls, checkedAt: new Date().toISOString() };
}

export async function getRecallFeed(): Promise<Snapshot> {
  if (cached && Date.now() - Date.parse(cached.checkedAt) < 3_600_000) return cached;
  if (pending) return pending;
  pending = fetchRecallSnapshot().then(snapshot => { cached = snapshot; return snapshot; });
  try { return await pending; } finally { pending = null; }
}

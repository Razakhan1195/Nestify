export type Recall = { id: string; title: string; product: string; url: string; issue: string; action: string; updated: string };
export type RecallItem = { id: string; name: string; brand: string | null; model_number: string | null };
function words(value: string) { return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function contains(text: string, phrase: string) { return Boolean(phrase) && (" " + text + " ").includes(" " + phrase + " "); }
export function matchReason(item: RecallItem, recall: Recall): string | null {
  const text = words(recall.product + " " + recall.title);
  const brand = words(item.brand ?? "");
  if (brand.length < 2 || !contains(text, brand)) return null;
  const model = words(item.model_number ?? "");
  if (model.length >= 4 && /[0-9]/.test(model) && contains(text, model)) return "Brand and model appear in the recall notice";
  const ignored = new Set([...brand.split(" "), "my", "the", "home", "new", "old", "with", "and", "for"]);
  const terms = [...new Set(words(item.name).split(" ").filter((word) => word.length >= 4 && !ignored.has(word)))];
  if (terms.length && terms.every((term) => contains(text, term))) return "Brand and product description overlap";
  return null;
}
export function recallKey(itemId: string, recall: Recall) { return "recall:" + itemId + ":" + recall.id + ":" + recall.updated; }
export function normalizeRecalls(input: unknown): Recall[] {
  if (!Array.isArray(input)) throw new Error("Unexpected recall feed");
  return input.flatMap((row) => {
    if (!row || typeof row !== "object" || row.Organization !== "Consumer product safety") return [];
    const field = (key: string) => typeof row[key] === "string" ? row[key].replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim() : "";
    const url = field("URL");
    try { const parsed = new URL(url); if (parsed.protocol !== "https:" || parsed.hostname !== "recalls-rappels.canada.ca") return []; } catch { return []; }
    const id = field("NID"), updated = field("Last updated");
    if (!/^\d+$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(updated)) return [];
    return [{ id, updated, url, title: field("Title"), product: field("Product"), issue: field("Issue"), action: field("What you should do") }];
  });
}

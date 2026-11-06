import { normalizeCanadianAddress } from "../../../apps/mobile/src/lib/canadian-address";
export async function googleAddressLookup(
  input: { sessionToken: string; cityOnly?: boolean; input?: string; placeId?: string },
  key: string,
  fetcher: typeof fetch = fetch,
) {
  const details = Boolean(input.placeId);
  const url = details
    ? "https://places.googleapis.com/v1/places/" + encodeURIComponent(input.placeId!) + "?sessionToken=" + encodeURIComponent(input.sessionToken) + "&languageCode=en"
    : "https://places.googleapis.com/v1/places:autocomplete";
  const response = await fetcher(url, {
    method: details ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json", "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": details ? "addressComponents" : "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
    },
    ...(details ? {} : { body: JSON.stringify({ input: input.input, includedRegionCodes: ["ca"], ...(input.cityOnly ? { includedPrimaryTypes: ["(cities)"] } : {}), languageCode: "en", sessionToken: input.sessionToken }) }),
    cache: "no-store", signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error("Address search unavailable");
  const body = await response.json();
  if (details) {
    const address = normalizeCanadianAddress(Array.isArray(body.addressComponents) ? body.addressComponents : []);
    if (!address) throw new Error("Choose a Canadian address");
    return { address };
  }
  const suggestions = (Array.isArray(body.suggestions) ? body.suggestions : [])
    .flatMap((s: { placePrediction?: { placeId?: string; text?: { text?: string } } }) => {
      const p = s.placePrediction;
      return p?.placeId && p.text?.text ? [{ id: p.placeId, label: p.text.text }] : [];
    }).slice(0, 5);
  return { suggestions };
}

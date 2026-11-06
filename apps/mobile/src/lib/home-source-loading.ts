type Sources<B, V, C> = { bills: () => Promise<B>; vault: () => Promise<V>; care: () => Promise<C> };
type Observers<B, V, C> = {
  isCurrent: () => boolean;
  bills: (result: PromiseSettledResult<B>) => void;
  vault?: (result: PromiseSettledResult<V>) => void;
  care?: (result: PromiseSettledResult<C>) => void;
};

async function settleAndPublish<T>(
  load: () => Promise<T>,
  isCurrent: () => boolean,
  publish?: (result: PromiseSettledResult<T>) => void,
): Promise<PromiseSettledResult<T>> {
  let result: PromiseSettledResult<T>;
  try { result = { status: "fulfilled", value: await load() }; }
  catch (reason) { result = { status: "rejected", reason }; }
  if (isCurrent()) publish?.(result);
  return result;
}

/** Independent Home sections can render immediately; overall refresh and
 * household completeness still wait for all sources. Nothing is cached or retried.
 * The caller's request-generation guard rejects superseded or unfocused results.
 */
export function loadHomeSources<B, V, C>(sources: Sources<B, V, C>, observers: Observers<B, V, C>) {
  return Promise.all([
    settleAndPublish(sources.bills, observers.isCurrent, observers.bills),
    settleAndPublish(sources.vault, observers.isCurrent, observers.vault),
    settleAndPublish(sources.care, observers.isCurrent, observers.care),
  ] as const);
}

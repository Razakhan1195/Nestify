import { Pool } from "undici";

const stagingOrigin = "https://gjwvalpxnfbvryosmcbj.supabase.co";
type PoolOptions = ConstructorParameters<typeof Pool>[1];
const defaults: PoolOptions = {
  connections: 16,
  pipelining: 1,
  keepAliveTimeout: 1_000,
  keepAliveMaxTimeout: 1_000,
  keepAliveTimeoutThreshold: 250,
  connectTimeout: 1_000,
  autoSelectFamily: true,
  autoSelectFamilyAttemptTimeout: 250,
};

/** A worker-local HTTP pool; it contains sockets, never user sessions or responses. */
export function createMobileHttpTransport(
  origin: string,
  upstream: typeof fetch = globalThis.fetch,
  options: PoolOptions = {},
) {
  const pool = new Pool(origin, { ...defaults, ...options });
  const fetcher: typeof fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== origin) return upstream(input, init);
    const requestInit: RequestInit & { dispatcher: Pool } = { ...init, dispatcher: pool };
    return upstream(input, requestInit);
  };
  return {
    fetch: fetcher,
    close: () => pool.close(),
    destroy: () => pool.destroy(),
    stats: () => ({ connected: pool.stats.connected, pending: pool.stats.pending, running: pool.stats.running }),
  };
}

let stagingTransport: ReturnType<typeof createMobileHttpTransport> | undefined;
/** Staging-only until the unchanged sustained acceptance test has passed. */
export function mobileHttpTransport(supabaseUrl: string) {
  if (process.env.REZLEE_MOBILE_HTTP_POOL_ENABLED !== "true" || supabaseUrl !== stagingOrigin) return undefined;
  stagingTransport ??= createMobileHttpTransport(stagingOrigin);
  return stagingTransport;
}

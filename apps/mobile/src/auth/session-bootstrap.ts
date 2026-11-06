export type SessionBootstrapState<T> = {
  session: T | null;
  isLoading: boolean;
  isRestoringSession: boolean;
};

/** The public entry UI must not wait indefinitely for an expired token refresh.
 * A timeout never clears persisted credentials or grants access to account data.
 */
export function observeSessionBootstrap<T>(options: {
  read: () => Promise<T | null>;
  subscribe: (listener: (event: string, session: T | null) => void) => () => void;
  changed: (state: SessionBootstrapState<T>) => void;
  timeoutMs?: number;
}) {
  let active = true;
  let receivedEvent = false;
  let state: SessionBootstrapState<T> = { session: null, isLoading: true, isRestoringSession: false };
  const emit = (next: SessionBootstrapState<T>) => { if (active) { state = next; options.changed(next); } };
  const timer = setTimeout(() => {
    if (active && state.isLoading) emit({ ...state, isLoading: false, isRestoringSession: true });
  }, options.timeoutMs ?? 2500);
  const unsubscribe = options.subscribe((event, session) => {
    if (!active || (event === "INITIAL_SESSION" && receivedEvent)) return;
    receivedEvent = true;
    clearTimeout(timer);
    emit({ session, isLoading: false, isRestoringSession: false });
  });
  void options.read().then(session => {
    if (!receivedEvent) emit({ session, isLoading: false, isRestoringSession: false });
  }).catch(() => {
    if (!receivedEvent) emit({ session: null, isLoading: false, isRestoringSession: false });
  }).finally(() => { clearTimeout(timer); });
  return () => { active = false; clearTimeout(timer); unsubscribe(); };
}

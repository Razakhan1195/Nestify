type Verified = { userId: string; session: { access_token: string; refresh_token: string } };
type Adapter = { currentUser(): Promise<string | null>; verify(email: string, password: string): Promise<Verified>; apply(session: Verified["session"]): Promise<void> };
/** Reauthentication must never silently sign an old account back in. */
export function createPasswordConfirmation(adapter: Adapter) {
  let busy = false;
  return async (userId: string, email: string, password: string) => {
    if (busy) throw Error("Please wait for identity confirmation.");
    busy = true;
    try {
      if (await adapter.currentUser() !== userId) throw Error("Account changed");
      const result = await adapter.verify(email, password);
      if (result.userId !== userId || await adapter.currentUser() !== userId) throw Error("Account changed");
      await adapter.apply(result.session);
      if (await adapter.currentUser() !== userId) throw Error("Account changed");
    } finally { busy = false; }
  };
}

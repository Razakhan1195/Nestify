type Session = { access_token: string; refresh_token: string };
export type EmailCodeAdapter = {
  send(email: string): Promise<void>;
  verify(email: string, code: string): Promise<{ userId: string; session: Session }>;
  currentUser(): Promise<string | null>;
  apply(session: Session): Promise<void>;
};
export function createEmailCodeFlow(adapter: EmailCodeAdapter, now = Date.now) {
  let busy = false, retryAt = 0;
  return {
    retryAt: () => retryAt,
    async request(email: string) {
      const clean = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 254) throw Error("Enter a valid email address.");
      if (busy) throw Error("Please wait for the current request.");
      if (now() < retryAt) throw Error("Wait a moment before requesting another code.");
      busy = true; retryAt = now() + 60000;
      try { await adapter.send(clean); }
      catch { throw Error("We couldn’t send a code. Please try again shortly."); }
      finally { busy = false; }
    },
    async verify(email: string, code: string, expectedUserId?: string) {
      if (busy) throw Error("Please wait for the current request.");
      if (!/^\d{6,8}$/.test(code.trim())) throw Error("Enter the code from your email.");
      busy = true;
      try {
        const original = await adapter.currentUser();
        if (expectedUserId ? original !== expectedUserId : Boolean(original)) throw Error("Account changed");
        const result = await adapter.verify(email.trim(), code.trim());
        if (expectedUserId && result.userId !== expectedUserId) throw Error("Wrong account");
        if ((await adapter.currentUser()) !== original) throw Error("Account changed");
        await adapter.apply(result.session);
        return result.userId;
      } catch { throw Error("The code couldn’t be confirmed for this account. Check it or request a new one."); }
      finally { busy = false; }
    },
  };
}

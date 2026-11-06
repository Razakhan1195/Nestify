export type PhoneInviteInput = { displayName: string; phone: string; relationship?: string; expensePersonId?: string };
type Intent = { input: PhoneInviteInput; requestId: string; token: string };
type Storage = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};
type Dependencies = {
  storage: Storage;
  randomUUID(): string;
  ownerId(): Promise<string>;
  definiteRejection?(error: unknown): boolean;
  create(input: PhoneInviteInput & { requestId: string; token: string }, ownerId: string): Promise<{ memberId: string; expiresAt: string }>;
};
export const phoneInviteKey = (ownerId: string) => "rezlee-phone-invite-" + ownerId;
function parse(raw: string): Intent {
  try {
    const value = JSON.parse(raw) as Intent;
    if (!value.input || typeof value.input.displayName !== "string" || !value.input.displayName.trim()
      || !/^\+[1-9][0-9]{7,14}$/.test(value.input.phone)
      || !/^[a-f0-9-]{36}$/i.test(value.requestId) || !/^[a-f0-9]{64}$/.test(value.token)
      || (value.input.relationship !== undefined && typeof value.input.relationship !== "string")
      || (value.input.expensePersonId !== undefined && typeof value.input.expensePersonId !== "string")) throw Error();
    return value;
  } catch { throw Error("Couldn’t restore the unfinished invitation. Try checking again before preparing another."); }
}
function sameInput(a: PhoneInviteInput, b: PhoneInviteInput) {
  return a.displayName === b.displayName && a.phone === b.phone
    && a.relationship === b.relationship && a.expensePersonId === b.expensePersonId;
}
export function createPhoneInviteRecovery(deps: Dependencies) {
  const active = new Set<string>();
  async function owner(expectedOwnerId?: string) {
    const id = await deps.ownerId();
    if (expectedOwnerId && id !== expectedOwnerId) throw Error("Your account changed. Reopen invitations to continue.");
    return id;
  }
  return {
    async pending(expectedOwnerId?: string): Promise<PhoneInviteInput | null> {
      const raw = await deps.storage.getItemAsync(phoneInviteKey(await owner(expectedOwnerId)));
      return raw ? parse(raw).input : null;
    },
    async create(input: PhoneInviteInput, expectedOwnerId?: string) {
      const id = await owner(expectedOwnerId), key = phoneInviteKey(id);
      if (active.has(id)) throw Error("This invitation is still being prepared.");
      active.add(id);
      try {
        const raw = await deps.storage.getItemAsync(key);
        const intent: Intent = raw ? parse(raw) : {
          input, requestId: deps.randomUUID(),
          token: deps.randomUUID().replace(/-/g, "") + deps.randomUUID().replace(/-/g, ""),
        };
        if (!sameInput(intent.input, input)) throw Error("An earlier invitation needs confirmation. Retry with the same details before creating another.");
        if (!raw) await deps.storage.setItemAsync(key, JSON.stringify(intent));
        // Keep the exact request and secret after every ambiguous failure, including HTTP 408.
        // Older servers also return 400 for database failures, so 400 is not proof of rejection.
        let result: { memberId: string; expiresAt: string };
        try { result = await deps.create({ ...intent.input, requestId: intent.requestId, token: intent.token }, id); }
        catch (error) {
          if (deps.definiteRejection?.(error)) await deps.storage.deleteItemAsync(key);
          throw error;
        }
        await deps.storage.setItemAsync(key + "-" + result.memberId, JSON.stringify({ phone: intent.input.phone, token: intent.token }));
        await deps.storage.deleteItemAsync(key);
        return result;
      } finally { active.delete(id); }
    },
  };
}

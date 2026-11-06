import Constants, { ExecutionEnvironment } from "expo-constants";
import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";
import { fetchEzgbAuthorization, syncEzgb, type EzgbSyncPayload } from "./ezgb-data";
import { EZGB_BROWSER_RETURN, EZGB_BROWSER_STORAGE, ezgbBrowserCallback, ezgbBrowserStartUrl, readEzgbAttempt } from "./ezgb-browser-contract";

export const ezgbSystemBrowserAvailable = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
let starting = false;
let completing: { url: string; promise: Promise<EzgbSyncPayload> } | null = null;
let completed: { url: string; userId: string; result: EzgbSyncPayload } | null = null;

async function currentUser() {
  return (await supabase.auth.getSession()).data.session?.user.id;
}
async function clearIfCurrent(id: string) {
  const current = readEzgbAttempt(await SecureStore.getItemAsync(EZGB_BROWSER_STORAGE));
  if (current?.id === id) await SecureStore.deleteItemAsync(EZGB_BROWSER_STORAGE);
}

export async function finishEzgbBrowser(url: string): Promise<EzgbSyncPayload> {
  if (completing) {
    if (completing.url === url) return completing.promise;
    throw Error("Another utility connection is finishing. Please return to Bills.");
  }
  const promise = (async () => {
    const userId = await currentUser();
    if (completed?.url === url && completed.userId === userId) return completed.result;
    const attempt = readEzgbAttempt(await SecureStore.getItemAsync(EZGB_BROWSER_STORAGE));
    const outcome = ezgbBrowserCallback(url, attempt, userId);
    if (outcome === "error") {
      await clearIfCurrent(attempt!.id);
      throw Error("The utility did not finish authorizing. You can start again.");
    }
    if (!attempt!.connectionIntent) throw Error("This connection needs a fresh start. Open it again from Find your provider.");
    // Recheck the household after the browser returns, not just the signed-in user.
    const current = await fetchEzgbAuthorization();
    if (current.userIdentifier !== attempt!.userIdentifier || await currentUser() !== userId) {
      await clearIfCurrent(attempt!.id);
      throw Error("Your account or household changed. Start the connection again.");
    }
    const stored = readEzgbAttempt(await SecureStore.getItemAsync(EZGB_BROWSER_STORAGE));
    if (stored?.id !== attempt!.id) throw Error("This connection is no longer active. Please start again.");
    // Retain a confirmed return through network loss. The signed attempt is also the durable
    // server job ID, so retrying this POST cannot create another import.
    await SecureStore.setItemAsync(EZGB_BROWSER_STORAGE, JSON.stringify({ ...attempt, returned: true }));
    const result = await syncEzgb(attempt!.userIdentifier, attempt!.connectionIntent);
    await clearIfCurrent(attempt!.id);
    completed = { url, userId: userId!, result };
    return result;
  })();
  completing = { url, promise };
  try { return await promise; } finally { completing = null; }
}

export async function startEzgbBrowser(utilityName?: string): Promise<EzgbSyncPayload | null> {
  if (starting || completing) throw Error("A utility connection is already open.");
  if (!ezgbSystemBrowserAvailable) throw Error("Use an installed Rezlee build for the browser connection.");
  starting = true;
  let id: string | undefined;
  try {
    const userId = await currentUser();
    if (!userId) throw Error("Sign in before connecting your utility.");
    const authorization = await fetchEzgbAuthorization({ connect: true, utilityName });
    if (!authorization.browserReturnReady || !authorization.connectionTrackingReady || !authorization.connectionIntent) throw Error("The browser connection is being updated. Please try again shortly.");
    if (await currentUser() !== userId) throw Error("Your sign-in changed. Start the connection again.");
    id = randomUUID();
    const url = ezgbBrowserStartUrl(authorization.authorizationUrl, id);
    completed = null;
    await SecureStore.setItemAsync(EZGB_BROWSER_STORAGE, JSON.stringify({
      id, userId, userIdentifier: authorization.userIdentifier, createdAt: Date.now(), connectionIntent: authorization.connectionIntent,
    }));
    if (await currentUser() !== userId) throw Error("Your sign-in changed. Start the connection again.");
    const browser = await import("expo-web-browser");
    const result = await browser.openAuthSessionAsync(url, EZGB_BROWSER_RETURN);
    if (result.type === "success") return await finishEzgbBrowser(result.url);
    // On Android the return route may receive the link before the browser promise settles.
    const pending = completing as { url: string; promise: Promise<EzgbSyncPayload> } | null;
    if (pending) return await pending.promise;
    const finished = completed as { userId: string; result: EzgbSyncPayload } | null;
    if (finished && finished.userId === await currentUser()) return finished.result;
    return null; // Closing the browser is never authorization success.
  } catch (error) {
    if (error instanceof Error && /^(Couldn’t|This connection|The utility|Your |Start |Sign in|The browser|A utility|Use an installed|Another utility)/.test(error.message)) throw error;
    throw Error("Couldn’t finish the utility connection. Return to Bills to check its status before trying again.");
  } finally {
    if (id) {
      const saved = readEzgbAttempt(await SecureStore.getItemAsync(EZGB_BROWSER_STORAGE));
      if (!saved?.returned) await clearIfCurrent(id);
    }
    starting = false;
  }
}

export async function canResumeEzgbBrowserConnection() {
  const attempt = readEzgbAttempt(await SecureStore.getItemAsync(EZGB_BROWSER_STORAGE));
  return Boolean((attempt?.returned || attempt?.checkOnly) && attempt.connectionIntent && attempt.userId === await currentUser());
}
export async function resumeEzgbBrowserConnection() {
  const attempt = readEzgbAttempt(await SecureStore.getItemAsync(EZGB_BROWSER_STORAGE));
  if (attempt?.checkOnly && attempt.utilityName && attempt.userId === await currentUser()) return checkEzgbExistingConnection(attempt.utilityName);
  if (!attempt?.returned || !attempt.connectionIntent) throw Error("This connection needs a fresh start. Open it again from Find your provider.");
  return finishEzgbBrowser(EZGB_BROWSER_RETURN + "?" + new URLSearchParams({ attempt: attempt.id, outcome: "success" }));
}

/** Explicit recovery for someone who already approved sharing at the utility.
 * This only requests data already authorized there; it never grants consent or
 * treats closing the browser as a successful connection.
 */
export async function checkEzgbExistingConnection(utilityName: string): Promise<EzgbSyncPayload> {
  if (starting || completing) throw Error("A utility connection is already open.");
  if (!utilityName.trim()) throw Error("Choose a utility before checking its connection.");
  starting = true;
  try {
    const userId = await currentUser();
    if (!userId) throw Error("Sign in before checking your utility.");
    const saved = readEzgbAttempt(await SecureStore.getItemAsync(EZGB_BROWSER_STORAGE));
    const pending = saved?.checkOnly && saved.utilityName === utilityName && saved.userId === userId ? saved : null;
    const authorization = await fetchEzgbAuthorization(pending ? undefined : { connect: true, utilityName, checkOnly: true });
    if (await currentUser() !== userId) throw Error("Your sign-in changed. Start the connection again.");
    if (pending && authorization.userIdentifier !== pending.userIdentifier) {
      await clearIfCurrent(pending.id);
      throw Error("Your account or household changed. Start the connection again.");
    }
    if (!pending && (!authorization.connectionTrackingReady || !authorization.connectionIntent)) {
      throw Error("The connection is being updated. Please try again shortly.");
    }
    const attempt = pending ?? {
      id: randomUUID(), userId, userIdentifier: authorization.userIdentifier,
      createdAt: Date.now(), connectionIntent: authorization.connectionIntent,
      checkOnly: true, utilityName,
    };
    if (!attempt.connectionIntent) throw Error("This connection needs a fresh start.");
    // Retain this same signed job through network loss so an explicit retry is idempotent.
    await SecureStore.setItemAsync(EZGB_BROWSER_STORAGE, JSON.stringify(attempt));
    if (await currentUser() !== userId) throw Error("Your sign-in changed. Start the connection again.");
    const result = await syncEzgb(attempt.userIdentifier, attempt.connectionIntent);
    await clearIfCurrent(attempt.id);
    return result;
  } finally {
    starting = false;
  }
}

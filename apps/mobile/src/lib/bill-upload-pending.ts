import * as SecureStore from "expo-secure-store";
import { supabase } from "./supabase";
async function key() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Sign in to save a statement.");
  return `rezlee.bill-upload.${data.session.user.id}`;
}
// Persist only a non-secret pointer. Reviewed fields and file state live in the
// authenticated server receipt; no document bytes or amounts go into this store.
export async function pendingBillUpload() { return SecureStore.getItemAsync(await key()); }
export async function rememberBillUpload(requestId: string) {
  const scoped = await key();
  const existing = await SecureStore.getItemAsync(scoped);
  if (existing && existing !== requestId) throw new Error("Finish the previous statement save first.");
  await SecureStore.setItemAsync(scoped, requestId);
}
export async function forgetBillUpload(requestId: string) {
  const scoped = await key();
  if (await SecureStore.getItemAsync(scoped) === requestId) await SecureStore.deleteItemAsync(scoped);
}

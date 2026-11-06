import * as SecureStore from "expo-secure-store";
import { validEmail } from "./email-auth";
const key = "rezlee.pending-signup.v1";
// Only the pending address is stored. Passwords never leave component memory.
export async function rememberPendingSignup(email: string) { await SecureStore.setItemAsync(key, email.trim()); }
export async function readPendingSignup() {
  const email = await SecureStore.getItemAsync(key);
  return email && validEmail(email) ? email : null;
}
export async function clearPendingSignup() { await SecureStore.deleteItemAsync(key); }

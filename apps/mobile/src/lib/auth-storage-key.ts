/** Keep sessions in the original project namespace when branding its auth URL. */
export function authStorageKey(supabaseUrl: string): string {
  const hostname = new URL(supabaseUrl).hostname;
  const project = hostname === "auth.rezlee.com" ? "eynbuhmtxkigvqoewbwi" : hostname.split(".")[0];
  return `sb-${project}-auth-token`;
}

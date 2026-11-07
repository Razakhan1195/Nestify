/** Customer product screens live in the installed app. Staff routes are separate. */
export function retiredCustomerPath(pathname: string): boolean {
 let path: string; try { path = decodeURIComponent(pathname).replace(/\\/g, "/").replace(/\/+/g, "/"); } catch { return true; }
 if (/^\/invite\/[a-f0-9]{12}\/?$/i.test(path)) return false; // Referral handoff only; no browser sign-in.
 const roots = ["app", "login", "signup", "forgot-password", "reset-password", "dashboard", "settings", "assistant", "appliances", "bills", "documents", "maintenance", "repairs", "warranties", "preview", "invite"];
 return roots.some(root => path === "/" + root || path.startsWith("/" + root + "/")) || path === "/auth/callback" || path === "/auth/invite";
}

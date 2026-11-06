/**
 * Enrollment-only diagnostics. Never authorizes access or replaces Supabase MFA.
 * The enrollment secret remains in transient browser memory and is never logged/sent.
 */
export type SetupCodeCheck = "matches-current-qr" | "time-skew" | "different-entry" | "unavailable";

function decodeBase32(raw: string): Uint8Array<ArrayBuffer> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const chars = raw.replace(/=+$/, "").toUpperCase();
  let buffer = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const char of chars) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw Error("Invalid Base32 TOTP secret");
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(bytes);
}

export async function checkSetupCode(secret: string, enteredCode: string, atMs = Date.now()): Promise<SetupCodeCheck> {
  if (!/^[A-Z2-7]+=*$/i.test(secret) || !/^\d{6}$/.test(enteredCode)) return "unavailable";
  if (typeof crypto === "undefined" || !crypto.subtle) return "unavailable";
  try {
    const key = await crypto.subtle.importKey("raw", decodeBase32(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const slot = Math.floor(atMs / 30000);
    for (const offset of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
      if (slot + offset < 0) continue;
      const counter = new ArrayBuffer(8);
      new DataView(counter).setBigUint64(0, BigInt(slot + offset), false);
      const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
      const start = signed[signed.length - 1] & 15;
      const truncated = ((signed[start] & 127) << 24) |
        (signed[start + 1] << 16) | (signed[start + 2] << 8) | signed[start + 3];
      const code = String(truncated % 1_000_000).padStart(6, "0");
      if (code === enteredCode) return Math.abs(offset) <= 1 ? "matches-current-qr" : "time-skew";
    }
    return "different-entry";
  } catch {
    return "unavailable";
  }
}
export function setupCodeAdvice(check: SetupCodeCheck): string {
  if (check === "matches-current-qr") return "This code matches the QR shown here at your computer's time, but Supabase rejected it. Another authentication issue is preventing enrollment; retrying codes alone will not solve it.";
  if (check === "time-skew") return "Your authenticator appears out of sync with the clock on this computer. Turn on automatic date and time on your phone, then wait for a new code.";
  if (check === "different-entry") return "This code does not match the QR currently displayed. Select the newly scanned Rezlee entry in your authenticator and wait for its next code.";
  return "";
}

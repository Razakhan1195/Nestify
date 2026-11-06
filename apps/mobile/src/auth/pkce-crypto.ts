type NativeCrypto = {
  random(values: Uint8Array): void;
  sha256(data: BufferSource): Promise<ArrayBuffer>;
};
type CryptoHost = { crypto?: { getRandomValues?: Crypto["getRandomValues"]; subtle?: { digest?: SubtleCrypto["digest"] } } };

// Supabase's native fallback uses Math.random and a plain challenge when these
// APIs are missing. Install only the two operations PKCE needs; never implement
// cryptography in JS or replace an existing WebCrypto implementation.
export function installPkceCrypto(host: CryptoHost, native: NativeCrypto) {
  if (!host.crypto) Object.defineProperty(host, "crypto", { value: {}, configurable: true });
  const crypto = host.crypto!;
  if (!crypto.getRandomValues) crypto.getRandomValues = <T extends ArrayBufferView | null>(values: T): T => {
    if (!ArrayBuffer.isView(values) || values instanceof DataView || values instanceof Float32Array || values instanceof Float64Array) throw new TypeError("Expected an integer typed array");
    if (values.byteLength > 65536) throw new RangeError("Random buffer too large");
    native.random(new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
    return values;
  };
  if (!crypto.subtle) crypto.subtle = {};
  if (!crypto.subtle.digest) crypto.subtle.digest = (algorithm, data) => {
    const name = typeof algorithm === "string" ? algorithm : algorithm.name;
    if (name.toUpperCase() !== "SHA-256") return Promise.reject(new Error("Unsupported digest"));
    return native.sha256(data);
  };
}

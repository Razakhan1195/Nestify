/** Accept same-origin relative paths only, including after URL normalization. */
export function safeLocalPath(value: unknown, fallback = "/app") {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  )
    return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded))
      return fallback;
    const url = new URL(value, "https://rezlee.invalid");
    return url.origin === "https://rezlee.invalid"
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

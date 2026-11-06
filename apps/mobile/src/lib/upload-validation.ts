// Keep aligned with the server's mobile-upload policy (covered by a contract test).
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const SCAN_FILE_TYPES = ["application/pdf", ...PHOTO_TYPES];
// Selection allows phone formats that prepareAttachment converts before upload.
export const RECORD_PICKER_TYPES = SCAN_FILE_TYPES;
export const RECORD_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export function uploadMimeType(name: string, provided?: string | null): string {
  if (provided && provided !== "application/octet-stream") return provided.toLowerCase();
  const types: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };
  return types[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

export function uploadValidationError(size: number | undefined, type: string, allowedTypes = SCAN_FILE_TYPES): string | null {
  if (size === 0) return "This file is empty. Choose another file or enter the details manually.";
  if (size !== undefined && size > MAX_UPLOAD_BYTES) return "Choose a file up to 4 MB, or enter the details manually.";
  if (!allowedTypes.includes(type)) return "This file type is not supported. Choose a PDF or a supported photo.";
  // Some pickers omit size; the server always checks the actual bytes.
  return null;
}

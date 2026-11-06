// Mobile uploads pass through a function with a 4.5 MB request-body limit.
// Leave room for multipart headers and record metadata. Web storage limits differ.
export const MAX_MOBILE_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_MOBILE_BODY_BYTES = MAX_MOBILE_FILE_BYTES + 64 * 1024;
export const SCAN_MIME_TYPES = [
  "application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
];

export class UploadError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

/** Count actual bytes even when Content-Length is missing or incorrect. */
export async function readMobileMultipart(request: Request): Promise<FormData> {
  const tooLarge = () => new UploadError("Choose a file up to 4 MB, or enter the details manually.", 413);
  if (Number(request.headers.get("content-length")) > MAX_MOBILE_BODY_BYTES) throw tooLarge();
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;") || !request.body) {
    throw new UploadError("Could not read the upload. Choose the file again.");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_MOBILE_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(chunk.value);
    }
    return await new Response(Buffer.concat(chunks), { headers: { "Content-Type": contentType } }).formData();
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError("Could not read the upload. Choose the file again.");
  } finally { reader.releaseLock(); }
}

/** Header checks catch obvious mismatches, not malware or all corrupt files. */
function matchesType(bytes: Buffer, type: string): boolean {
  if (type === "application/pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (type === "image/heic" || type === "image/heif") {
    if (bytes.length < 16 || bytes.subarray(4, 8).toString("ascii") !== "ftyp") return false;
    const boxSize = bytes.readUInt32BE(0);
    if (boxSize < 16) return false;
    const brands = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"];
    for (let offset = 8; offset + 4 <= Math.min(boxSize, bytes.length); offset += 4) {
      if (offset !== 12 && brands.includes(bytes.subarray(offset, offset + 4).toString("ascii"))) return true;
    }
  }
  return false;
}

export async function mobileUploadFile(form: FormData, allowedTypes: readonly string[], required = true): Promise<File | null> {
  const entries = form.getAll("file");
  for (const [key, value] of form) {
    if (value instanceof File && key !== "file") throw new UploadError("Choose one file at a time.");
  }
  if (entries.length === 0 && !required) return null;
  if (entries.length !== 1 || !(entries[0] instanceof File)) throw new UploadError("Choose one photo or PDF to upload.");
  const file = entries[0];
  if (!file.size) throw new UploadError("This file is empty. Choose another file or enter the details manually.");
  if (file.size > MAX_MOBILE_FILE_BYTES) throw new UploadError("Choose a file up to 4 MB, or enter the details manually.", 413);
  if (!allowedTypes.includes(file.type)) throw new UploadError("This file type is not supported. Choose a PDF or a supported photo.");
  if (!matchesType(Buffer.from(await file.slice(0, 512).arrayBuffer()), file.type)) {
    throw new UploadError("The file doesn't match its format. Export a new PDF or photo, or enter the details manually.");
  }
  return file;
}

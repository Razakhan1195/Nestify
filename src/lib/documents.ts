export const DOCUMENT_BUCKET = "rezlee-documents";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
export function isOwnedDocumentPath(
  path: string,
  userId: string,
  homeId: string,
) {
  return (
    path.startsWith(`${userId}/${homeId}/`) &&
    !path.includes("..") &&
    !path.includes("\\")
  );
}

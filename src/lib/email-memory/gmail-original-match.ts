import { createHash } from "node:crypto";
import type { readableMessage } from "./gmail-client";

type Attachment = ReturnType<typeof readableMessage>["attachments"][number];
type Original = {
  attachmentId?: string;
  file: { name: string; mime: string; size: number; sha256: string };
};

/** Gmail can issue a different attachment ID when the same message is read again.
 * Re-find the original within that message, then verify its bytes before saving.
 */
export async function readVerifiedGmailOriginal(
  attachments: readonly Attachment[],
  expected: Original,
  read: (part: Attachment) => Promise<Buffer>,
): Promise<Buffer> {
  const candidates = attachments.filter(part =>
    part.name === expected.file.name &&
    part.mime === expected.file.mime &&
    part.size === expected.file.size,
  );
  const part = candidates.find(item => item.id === expected.attachmentId) ?? candidates[0];
  if (!part) throw Error("The original attachment is unavailable. Upload your saved copy instead.");
  const bytes = await read(part);
  if (bytes.length !== expected.file.size ||
      createHash("sha256").update(bytes).digest("hex") !== expected.file.sha256) {
    throw Error("The original changed. Reopen this email record before saving.");
  }
  return bytes;
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readVerifiedGmailOriginal } from "../src/lib/email-memory/gmail-original-match";

const bytes = Buffer.from("original household statement");
const file = {
  name: "statement.pdf", mime: "application/pdf", size: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
const part = { id: "fresh-id", name: file.name, mime: file.mime, size: file.size };

test("a rotated Gmail attachment ID still saves the identical original", async () => {
  let fetched = "";
  const actual = await readVerifiedGmailOriginal([part], { attachmentId: "old-id", file }, async found => {
    fetched = found.id; return bytes;
  });
  assert.equal(fetched, "fresh-id");
  assert.deepEqual(actual, bytes);
});

test("inline original bytes remain supported without an attachment ID", async () => {
  const inline = { ...part, id: "", inlineData: bytes.toString("base64url") };
  assert.deepEqual(await readVerifiedGmailOriginal([inline], { file }, async found =>
    Buffer.from(found.inlineData!, "base64url")), bytes);
});

test("matching names and rotated IDs never allow changed bytes to be saved", async () => {
  const changed = Buffer.from(bytes); changed[0] ^= 1;
  await assert.rejects(readVerifiedGmailOriginal([part], { attachmentId: "old-id", file },
    async () => changed), /original changed/);
  await assert.rejects(readVerifiedGmailOriginal([part], { file },
    async () => bytes.subarray(1)), /original changed/);
});

test("a different filename, MIME type or size is rejected before downloading", async () => {
  for (const wrong of [{ ...part, name: "other.pdf" }, { ...part, mime: "image/png" }, { ...part, size: part.size + 1 }]) {
    let reads = 0;
    await assert.rejects(readVerifiedGmailOriginal([wrong], { attachmentId: wrong.id, file },
      async () => { reads++; return bytes; }), /original attachment is unavailable/);
    assert.equal(reads, 0);
  }
});

test("an unchanged attachment ID uses the same content verification", async () => {
  assert.deepEqual(await readVerifiedGmailOriginal([part], { attachmentId: part.id, file }, async () => bytes), bytes);
  await assert.rejects(readVerifiedGmailOriginal([], { file }, async () => bytes), /unavailable/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { scanMobileUpload } from "../src/lib/ai/mobile-scan";
import { DOCUMENT_MIME_TYPES } from "../src/lib/documents";
import { MAX_MOBILE_BODY_BYTES, MAX_MOBILE_FILE_BYTES, mobileUploadFile, readMobileMultipart, SCAN_MIME_TYPES, UploadError } from "../src/lib/uploads/mobile-upload";
import { MAX_UPLOAD_BYTES, RECORD_PICKER_TYPES, RECORD_FILE_TYPES, SCAN_FILE_TYPES, uploadMimeType, uploadValidationError } from "../apps/mobile/src/lib/upload-validation";

const pdf = () => new File(["%PDF-1.7\nfixture, not a customer document\n%%EOF"], "bill.pdf", { type: "application/pdf" });
function form(file: File | null = pdf()) {
  const body = new FormData(); body.set("kind", "bill");
  if (file) body.set("file", file);
  return body;
}
const request = (body = form()) => new Request("http://localhost/scan", { method: "POST", body });
function fixture(options: { deny?: boolean; fail?: boolean } = {}) {
  let reserves = 0, extractions = 0;
  return {
    dependencies: {
      async reserve() { reserves++; return options.deny ? { ok: false as const, status: 429, message: "Limit reached" } : { ok: true as const }; },
      async extract(kind: string, part: { data: string; mediaType: string }) {
        extractions++; assert.equal(kind, "bill"); assert.equal(part.mediaType, "application/pdf");
        assert.match(Buffer.from(part.data, "base64").toString(), /^%PDF-/);
        if (options.fail) throw new Error("PRIVATE DOCUMENT CONTENT");
        return { amount: "42.00" };
      },
    },
    counts: () => ({ reserves, extractions }),
  };
}

test("valid multipart is parsed and scanned once after one allowance reservation", async () => {
  const f = fixture(); const response = await scanMobileUpload(request(), f.dependencies);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { kind: "bill", data: { amount: "42.00" } });
  assert.deepEqual(f.counts(), { reserves: 1, extractions: 1 });
});

for (const [name, change] of Object.entries({
  missing: (f: FormData) => f.delete("file"),
  empty: (f: FormData) => f.set("file", new File([], "empty.pdf", { type: "application/pdf" })),
  unsupported: (f: FormData) => f.set("file", new File(["<svg/>"], "file.svg", { type: "image/svg+xml" })),
  mismatched: (f: FormData) => f.set("file", new File(["<html>not a pdf</html>"], "file.pdf", { type: "application/pdf" })),
  duplicate: (f: FormData) => f.append("file", pdf()),
  unexpected: (f: FormData) => f.append("anotherFile", pdf()),
  invalidKind: (f: FormData) => f.set("kind", "unavailable"),
  duplicateKind: (f: FormData) => f.append("kind", "bill"),
  stringFile: (f: FormData) => f.set("file", "not a file"),
})) {
  test(`${name} input uses no AI allowance and calls no model`, async () => {
    const body = form(); change(body); const f = fixture();
    assert.equal((await scanMobileUpload(request(body), f.dependencies)).status, 400);
    assert.deepEqual(f.counts(), { reserves: 0, extractions: 0 });
  });
}

test("oversized file with an otherwise legal multipart body is rejected before reservation", async () => {
  const f = fixture();
  const body = form(new File([new Uint8Array(MAX_MOBILE_FILE_BYTES + 1)], "large.pdf", { type: "application/pdf" }));
  assert.equal((await scanMobileUpload(request(body), f.dependencies)).status, 413);
  assert.deepEqual(f.counts(), { reserves: 0, extractions: 0 });
});

test("a file exactly at the advertised limit still fits with multipart overhead", async () => {
  const bytes = Buffer.alloc(MAX_MOBILE_FILE_BYTES); bytes.write("%PDF-1.7\n");
  const parsed = await readMobileMultipart(request(form(new File([new Uint8Array(bytes)], "limit.pdf", { type: "application/pdf" }))));
  assert.equal((await mobileUploadFile(parsed, SCAN_MIME_TYPES))?.size, MAX_MOBILE_FILE_BYTES);
});

test("stream size is enforced without trusting Content-Length, and reading stops at the limit", async () => {
  for (const declaredLength of [null, "1"]) {
    let canceled = false, delivered = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { delivered++; controller.enqueue(new Uint8Array(64 * 1024)); },
      cancel() { canceled = true; },
    });
    const headers: Record<string, string> = { "Content-Type": "multipart/form-data; boundary=test" };
    if (declaredLength) headers["Content-Length"] = declaredLength;
    const req = new Request("http://localhost/upload", { method: "POST", body: stream, headers, duplex: "half" } as RequestInit);
    const f = fixture();
    assert.equal((await scanMobileUpload(req, f.dependencies)).status, 413);
    assert.equal(canceled, true); assert.ok(delivered <= MAX_MOBILE_BODY_BYTES / (64 * 1024) + 2);
    assert.deepEqual(f.counts(), { reserves: 0, extractions: 0 });
  }
});

test("declared oversized and malformed bodies fail without AI calls", async () => {
  const large = request(); large.headers.set("Content-Length", String(MAX_MOBILE_BODY_BYTES + 1));
  const malformed = new Request("http://localhost/upload", { method: "POST", body: "not multipart", headers: { "Content-Type": "multipart/form-data; boundary=test" } });
  for (const [req, status] of [[large, 413], [malformed, 400]] as const) {
    const f = fixture(); assert.equal((await scanMobileUpload(req, f.dependencies)).status, status);
    assert.deepEqual(f.counts(), { reserves: 0, extractions: 0 });
  }
});

test("allowance denial prevents model invocation", async () => {
  const f = fixture({ deny: true }); assert.equal((await scanMobileUpload(request(), f.dependencies)).status, 429);
  assert.deepEqual(f.counts(), { reserves: 1, extractions: 0 });
});

test("model failure gives manual recovery and does not log private provider error contents", async (t) => {
  const log = t.mock.method(console, "error", () => undefined);
  const f = fixture({ fail: true }); const response = await scanMobileUpload(request(), f.dependencies);
  assert.equal(response.status, 502); assert.match((await response.json()).error, /manually/);
  assert.deepEqual(f.counts(), { reserves: 1, extractions: 1 });
  assert.equal(log.mock.callCount(), 1); assert.doesNotMatch(JSON.stringify(log.mock.calls[0].arguments), /PRIVATE DOCUMENT CONTENT/);
});

test("metadata-only records stay supported while malformed attachments are rejected", async () => {
  const body = new FormData(); body.set("title", "Insurance policy");
  const parsed = await readMobileMultipart(request(body));
  assert.equal(await mobileUploadFile(parsed, DOCUMENT_MIME_TYPES, false), null);
  body.set("other", pdf());
  await assert.rejects(mobileUploadFile(body, DOCUMENT_MIME_TYPES, false), UploadError);
  body.delete("other"); body.set("file", new File([], "empty.pdf", { type: "application/pdf" }));
  await assert.rejects(mobileUploadFile(body, DOCUMENT_MIME_TYPES, false), /empty/);
});

test("known image headers including HEIC and HEIF are accepted without changing document storage types", async () => {
  const headers: Record<string, Buffer> = {
    "image/jpeg": Buffer.from([255, 216, 255, 224]),
    "image/png": Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    "image/webp": Buffer.from("RIFF0000WEBP"),
    "image/heic": Buffer.from([0, 0, 0, 20, ...Buffer.from("ftypheic0000mif1")]),
    "image/heif": Buffer.from([0, 0, 0, 20, ...Buffer.from("ftypmif10000heic")]),
  };
  for (const [type, bytes] of Object.entries(headers)) {
    const body = form(new File([new Uint8Array(bytes)], "photo", { type }));
    assert.equal((await mobileUploadFile(body, SCAN_MIME_TYPES))?.type, type);
    if (type === "image/heic" || type === "image/heif") await assert.rejects(mobileUploadFile(body, DOCUMENT_MIME_TYPES), /not supported/);
  }
});

test("mobile picker policy matches server policy, infers known extensions and keeps unknown types unsupported", () => {
  assert.equal(MAX_UPLOAD_BYTES, MAX_MOBILE_FILE_BYTES);
  assert.deepEqual(SCAN_FILE_TYPES, SCAN_MIME_TYPES);
  assert.deepEqual(RECORD_FILE_TYPES, DOCUMENT_MIME_TYPES);
  assert.equal(uploadMimeType("BILL.PDF", "application/octet-stream"), "application/pdf");
  assert.equal(uploadMimeType("Photo.HEIF"), "image/heif");
  assert.equal(uploadMimeType("manual.docx"), "application/octet-stream");
  assert.match(uploadValidationError(0, "application/pdf")!, /empty/);
  assert.match(uploadValidationError(MAX_UPLOAD_BYTES + 1, "application/pdf")!, /4 MB/);
  assert.equal(uploadValidationError(MAX_UPLOAD_BYTES, "application/pdf"), null);
  assert.equal(uploadValidationError(undefined, "application/pdf"), null);
});


test("phone photo selection allows conversion without widening the saved-original policy", () => {
  for (const type of ["image/heic", "image/heif"]) {
    assert(RECORD_PICKER_TYPES.includes(type));
    assert(!RECORD_FILE_TYPES.includes(type));
    assert.match(uploadValidationError(100, type, RECORD_FILE_TYPES)!, /not supported/);
  }
  assert.equal(uploadValidationError(100, "image/jpeg", RECORD_FILE_TYPES), null);
});

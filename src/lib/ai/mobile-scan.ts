import {isProviderCreditExhausted,AI_CREDIT_MESSAGE} from "./service-failure";
import type { AiFilePart } from "./extraction";
import { mobileUploadFile, readMobileMultipart, SCAN_MIME_TYPES, UploadError } from "../uploads/mobile-upload";

const VALID_KINDS = ["appliance", "warranty", "document", "bill", "bill_history", "receipt"] as const;
export type ScanKind = (typeof VALID_KINDS)[number];
type Dependencies = {
  reserve(kind: ScanKind): Promise<{ ok: true; release?:()=>Promise<void> } | { ok: false; message: string; status: number }>;
  extract(kind: ScanKind, file: AiFilePart): Promise<unknown>;
};

/** Called only after authentication; validation must precede any AI allowance use. */
export async function scanMobileUpload(request: Request, dependencies: Dependencies): Promise<Response> {
  let kind: ScanKind;
  let part: AiFilePart;
  try {
    const form = await readMobileMultipart(request);
    const kinds = form.getAll("kind");
    if (kinds.length !== 1 || typeof kinds[0] !== "string" || !VALID_KINDS.includes(kinds[0] as ScanKind)) {
      throw new UploadError("Choose a supported scan type.");
    }
    kind = kinds[0] as ScanKind;
    const file = (await mobileUploadFile(form, SCAN_MIME_TYPES))!;
    part = { data: Buffer.from(await file.arrayBuffer()).toString("base64"), mediaType: file.type, filename: file.name.slice(0, 250) || "upload" };
  } catch (error) {
    return Response.json({ error: error instanceof UploadError ? error.message : "Could not read the file. Choose it again." }, { status: error instanceof UploadError ? error.status : 400 });
  }

  const reservation = await dependencies.reserve(kind);
  if (!reservation.ok) return Response.json({ error: reservation.message }, { status: reservation.status });
  try {
    return Response.json({ kind, data: await dependencies.extract(kind, part) });
  } catch (error) {
    await reservation.release?.().catch(()=>console.warn("[mobile-ai-scan] allowance recovery needed"));
    // Provider errors can contain customer documents or request payloads.
    console.error("[mobile-ai-scan] failed", { kind, code: "extraction_failed" });
    if(isProviderCreditExhausted(error)) return Response.json({error:AI_CREDIT_MESSAGE},{status:429});
    return Response.json({ error: "We couldn't read that one. Try a clearer photo or enter the details manually." }, { status: 502 });
  }
}

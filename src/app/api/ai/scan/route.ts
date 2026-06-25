import {
  classifyDocument,
  extractAppliance,
  extractBill,
  extractWarranty,
  type AiFilePart,
} from "@/lib/ai/extraction";
import { guardAiRequest } from "@/lib/ai/guard";

export const maxDuration = 60;

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_PREFIXES = ["image/"];
const ALLOWED_TYPES = ["application/pdf"];
const VALID_KINDS = ["appliance", "warranty", "document", "bill"] as const;
type ScanKind = (typeof VALID_KINDS)[number];

function isAllowedType(type: string) {
  return ALLOWED_PREFIXES.some((p) => type.startsWith(p)) || ALLOWED_TYPES.includes(type);
}

export async function POST(req: Request) {
  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Upload a photo or PDF to scan." }, { status: 400 });
  }

  const kind = String(form.get("kind") ?? "");
  if (!VALID_KINDS.includes(kind as ScanKind)) {
    return Response.json({ error: "Unsupported scan type." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Upload a photo or PDF to scan." }, { status: 400 });
  }

  if (file.size === 0) {
    return Response.json({ error: "That file looks empty." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "File is too large (max 15 MB)." }, { status: 400 });
  }
  if (!isAllowedType(file.type)) {
    return Response.json(
      { error: "Use an image (JPG/PNG/HEIC) or a PDF." },
      { status: 400 },
    );
  }

  const part: AiFilePart = {
    data: Buffer.from(await file.arrayBuffer()).toString("base64"),
    mediaType: file.type,
    filename: file.name || "upload",
  };

  try {
    if (kind === "appliance") {
      const data = await extractAppliance(part);
      return Response.json({ kind, data });
    }
    if (kind === "warranty") {
      const data = await extractWarranty(part);
      return Response.json({ kind, data });
    }
    if (kind === "bill") {
      const data = await extractBill(part);
      return Response.json({ kind, data });
    }
    const data = await classifyDocument(part);
    return Response.json({ kind, data });
  } catch (error) {
    console.error("[v0] ai scan failed", { kind, error });
    return Response.json(
      { error: "We couldn't read that one. Try a clearer photo or enter the details manually." },
      { status: 502 },
    );
  }
}

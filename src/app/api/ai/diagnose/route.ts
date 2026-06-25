import { diagnoseRepair, type AiFilePart } from "@/lib/ai/extraction";
import { guardAiRequest } from "@/lib/ai/guard";

export const maxDuration = 60;

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

function isAllowedType(type: string) {
  return type.startsWith("image/") || type === "application/pdf";
}

export async function POST(req: Request) {
  const guard = await guardAiRequest();
  if (!guard.ok) return guard.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Describe the issue to get help." }, { status: 400 });
  }

  const description = String(form.get("description") ?? "").trim();
  const location = String(form.get("location") ?? "").trim() || null;

  if (description.length < 8) {
    return Response.json(
      { error: "Add a little more detail about what's happening." },
      { status: 400 },
    );
  }

  let file: AiFilePart | null = null;
  const upload = form.get("file");
  if (upload instanceof File && upload.size > 0) {
    if (upload.size > MAX_FILE_BYTES) {
      return Response.json({ error: "Photo is too large (max 15 MB)." }, { status: 400 });
    }
    if (!isAllowedType(upload.type)) {
      return Response.json({ error: "Use an image or PDF." }, { status: 400 });
    }
    file = {
      data: Buffer.from(await upload.arrayBuffer()).toString("base64"),
      mediaType: upload.type,
      filename: upload.name || "upload",
    };
  }

  try {
    const data = await diagnoseRepair({ description, location, file });
    return Response.json({ data });
  } catch (error) {
    console.error("[v0] ai diagnose failed", error);
    return Response.json(
      { error: "We couldn't analyze that right now. Please try again." },
      { status: 502 },
    );
  }
}

import { scanMobileUpload } from "@/lib/ai/mobile-scan";
import {
  classifyDocument,
  extractAppliance,
  extractBill,
  extractBillHistory,
  extractReceipt,
  extractWarranty,
} from "@/lib/ai/extraction";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { reserveAiRequest, statementReadingEnabled } from "@/lib/ai/reservation";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) {
    return Response.json({ error: auth.error.message }, { status: auth.error.status });
  }
  return scanMobileUpload(request, {
    async reserve(kind) {
      if (!checkAiRateLimit(auth.user.id).allowed) {
        return { ok: false, status: 429, message: "You've reached today's limit for AI actions. Try again tomorrow." };
      }
      return reserveAiRequest(auth.supabase, kind === "bill_history" ? "statement-reading" : undefined, kind === "bill" || kind === "bill_history" ? "document" : "assistant");
    },
    async extract(kind, part) {
      if (kind === "receipt") return extractReceipt(part);
      if (kind === "bill") return extractBill(part);
      if (kind === "bill_history") return extractBillHistory(part);
      if (kind === "appliance") return extractAppliance(part);
      if (kind === "warranty") return extractWarranty(part);
      return classifyDocument(part);
    },
  });
}

export async function GET(request: Request) {
 const auth = await authenticateMobileRequest(request);
 if (auth.error) return Response.json({ error: auth.error.message }, { status: auth.error.status });
 return Response.json({ receiptExtraction: process.env.REZLEE_AI_DISABLED !== "true", statementExtraction: statementReadingEnabled() }, { headers: { "Cache-Control": "no-store" } });
}

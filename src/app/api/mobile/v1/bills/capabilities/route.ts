import { NextResponse } from "next/server";
import { authenticateMobileRequest } from "@/lib/supabase/mobile";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: auth.error.status });
  const [manual, upload, evidence, energy] = await Promise.all([
    auth.supabase.rpc("rezlee_manual_history_available"),
    auth.supabase.rpc("rezlee_bill_upload_available"),
    auth.supabase.rpc("rezlee_statement_intake_evidence_available"),
    auth.supabase.rpc("rezlee_statement_energy_evidence_available"),
  ]);
  return NextResponse.json({ statementEnergyEvidence: !energy.error && energy.data === true, statementIntakeEvidence: !evidence.error && evidence.data === true, manualHistory: !manual.error && manual.data === true, originalUpload: !upload.error && upload.data === true, batchUpload: !upload.error && upload.data === true });
}

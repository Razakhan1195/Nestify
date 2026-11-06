type ImportProgress = { status: string; authenticated?: boolean; saved: number; originals?: number };

// Authorization, saved results and a complete import are separate milestones.
export function importJourney(progress: ImportProgress) {
  const active = ["preparing", "queued", "running", "verification"].includes(progress.status);
  const needsPresence = active && (progress.status === "verification" || progress.authenticated !== true);
  const stopped = ["canceled", "cancelled"].includes(progress.status);
  const complete = progress.status === "completed";
  const partial = progress.status === "partial";
  const failed = progress.status === "failed";
  const title = needsPresence ? progress.status === "verification" ? "Verify your sign-in" : "Stay for sign-in"
    : stopped ? "Import stopped"
    : failed ? "Your import needs attention"
    : complete ? progress.saved > 0 ? "Your bill history is ready" : "No bills in this date range"
    : partial ? progress.saved > 0 ? "Some bills are saved" : "No bills saved yet"
    : active ? progress.saved > 0 ? "Your latest bills are ready" : "We’ll take it from here"
    : "Check your import status";
  const original = (progress.originals ?? 0) > 0 ? " Open an available original PDF to check the details." : "";
  const next = progress.saved > 0
    ? progress.saved === 1
      ? "Start with your saved bill: review the charges." + original + " Comparisons need another usable period for the same account."
      : "Open a saved bill to review its charges." + original + " Compare available periods for the same account in Bills."
    : complete ? "Your provider returned no bills for the requested dates. You can upload a statement instead."
    : stopped || failed || partial ? "You can retry from this connection or upload a statement instead."
    : null;
  return { active, needsPresence, title, next };
}

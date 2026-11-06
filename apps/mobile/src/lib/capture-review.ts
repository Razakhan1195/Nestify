import { receiptSuggestions } from "./receipt-review";

const text = (value: unknown, max = 200) => typeof value === "string" ? value.trim().slice(0, max) : "";
export const captureDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : "";
export type CaptureKind = "receipt" | "warranty" | "document";
export type RecordSuggestion = { title: string; category: string; issued_on: string; expires_on: string; notes: string; reviewNotes: string[] };

export function documentSuggestions(kind: CaptureKind, data: Record<string, unknown>): RecordSuggestion | null {
  if (kind === "receipt") return receiptSuggestions(data);
  if (kind === "warranty") {
    const item = text(data.item_name), brand = text(data.brand), coverage = text(data.coverage_summary, 600);
    if (!item && !brand && !coverage && !captureDate(data.warranty_expires_on)) return null;
    return {
      title: (item ? (brand && !item.toLowerCase().includes(brand.toLowerCase()) ? brand + " " + item : item) : brand || "Product").slice(0, 180) + " warranty",
      category: "Warranty", issued_on: "", expires_on: captureDate(data.warranty_expires_on),
      notes: [
        text(data.provider) && "Issuer: " + text(data.provider),
        text(data.model_number) && "Model: " + text(data.model_number),
        text(data.serial_number) && "Serial: " + text(data.serial_number),
        captureDate(data.purchase_date) && "Printed purchase date: " + captureDate(data.purchase_date),
        coverage && "Printed coverage: " + coverage,
        "Read from the original. Confirm with the issuer before relying on coverage.",
      ].filter(Boolean).join("\n"),
      reviewNotes: ["Check the exact model and printed coverage. A purchase date alone does not establish when coverage starts."],
    };
  }
  const title = text(data.title), summary = text(data.summary, 2200);
  if (!title && !summary) return null;
  const allowed = ["Receipt", "Warranty", "Insurance", "Manual", "Lease", "Contract", "Tax", "Other"];
  const category = allowed.find(value => value.toLowerCase() === text(data.document_type).toLowerCase()) ?? "Other";
  const issued = captureDate(data.issued_on);
  let expires = captureDate(data.expires_on);
  const reviewNotes: string[] = [];
  if (issued && expires && expires < issued) { expires = ""; reviewNotes.push("The expiry could not be confirmed. Check the original if you want to track it."); }
  return {
    title: title || "Household document", category, issued_on: category === "Warranty" ? "" : issued, expires_on: expires,
    notes: [summary, category === "Warranty" && issued ? "Printed document issue date: " + issued : null, "Details suggested from the original. An invoice or quote does not prove payment or completed work."].filter(Boolean).join("\n"),
    reviewNotes,
  };
}

export function applianceSuggestions(data: Record<string, unknown>) {
  return {
    name: text(data.name), brand: text(data.brand), model_number: text(data.model_number),
    serial_number: text(data.serial_number), category: text(data.category),
    room_or_area: text(data.room_or_area), product_barcode: "",
    warranty_expires_on: captureDate(data.warranty_expires_on),
  };
}

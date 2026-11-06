import { vaultCategories } from "./vault-input";

type DocumentCategoryInput = {
  category?: string | null;
  document_type: string | null;
  title: string;
  file_name: string | null;
};

/** The user's saved category wins over legacy storage types and filename guesses. */
export function documentCategory(input: DocumentCategoryInput): typeof vaultCategories[number] {
  const selected = vaultCategories.find(category => category === input.category);
  if (selected) return selected;
  const text = [input.document_type, input.title, input.file_name].filter(Boolean).join(" ").toLowerCase();
  if (text.includes("insurance")) return "Insurance";
  if (text.includes("warranty")) return "Warranty";
  if (text.includes("manual")) return "Manual";
  if (text.includes("receipt") || text.includes("invoice")) return "Receipt";
  if (text.includes("tax")) return "Tax";
  if (text.includes("lease")) return "Lease";
  if (text.includes("contract")) return "Contract";
  return "Other";
}

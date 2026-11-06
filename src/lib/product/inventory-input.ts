import { vaultDate } from "./vault-input";
import { normalizeBarcode } from "./barcode";
import { z } from "zod";
const optionalText = z.string().trim().max(200).optional().default("");
export const inventoryInput = z.object({
  id: z.string().uuid().optional(),
  warranty_expires_on: vaultDate.optional(),
  product_barcode: z.string().trim().max(30).refine(v => !v || Boolean(normalizeBarcode(v)), "Enter a valid product barcode.").transform(v => v ? normalizeBarcode(v)! : "").optional(),
  name: z.string().trim().min(1, "Enter an item name.").max(200),
  brand: optionalText, model_number: optionalText, serial_number: optionalText,
  category: optionalText, room_or_area: optionalText,
});

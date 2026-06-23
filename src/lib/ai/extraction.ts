import { generateText, Output } from "ai";
import { z } from "zod";

import { AI_MODELS } from "@/lib/ai/models";

// A file payload decoded from an upload, ready to hand to a multi-modal model.
export type AiFilePart = {
  data: string; // base64-encoded contents
  mediaType: string;
  filename: string;
};

const DATE_HINT =
  "Use ISO format YYYY-MM-DD. If the value is not present or you are unsure, return null. Never guess.";

// ----- Appliance / system extraction (snap-to-add) -----

export const applianceExtractionSchema = z.object({
  name: z
    .string()
    .nullable()
    .describe("Short human name for the item, e.g. 'Bosch dishwasher' or 'Carrier furnace'."),
  category: z
    .string()
    .nullable()
    .describe("One of: HVAC, Appliance, Plumbing, Electrical, Exterior, Safety. Best guess."),
  brand: z.string().nullable().describe("Manufacturer/brand name."),
  model_number: z.string().nullable().describe("Model number exactly as printed."),
  serial_number: z.string().nullable().describe("Serial number exactly as printed."),
  room_or_area: z
    .string()
    .nullable()
    .describe("Likely room or area if visible/inferable, otherwise null."),
  purchase_date: z.string().nullable().describe(`Purchase or manufacture date. ${DATE_HINT}`),
  warranty_expires_on: z
    .string()
    .nullable()
    .describe(`Warranty expiry date if shown. ${DATE_HINT}`),
  notes: z
    .string()
    .nullable()
    .describe("Any other useful detail (capacity, voltage, install notes). Keep under 200 chars."),
});

export type ApplianceExtraction = z.infer<typeof applianceExtractionSchema>;

// ----- Warranty extraction (snap-to-add) -----

export const warrantyExtractionSchema = z.object({
  item_name: z
    .string()
    .nullable()
    .describe("The product or system the warranty covers."),
  brand: z.string().nullable().describe("Manufacturer/brand."),
  model_number: z.string().nullable().describe("Model number if present."),
  serial_number: z.string().nullable().describe("Serial number if present."),
  provider: z
    .string()
    .nullable()
    .describe("Who issues/honors the warranty (manufacturer, retailer, or third party)."),
  coverage_summary: z
    .string()
    .nullable()
    .describe("One sentence summarizing what is covered. Under 200 chars."),
  purchase_date: z.string().nullable().describe(`Purchase date. ${DATE_HINT}`),
  warranty_expires_on: z
    .string()
    .nullable()
    .describe(`Date the warranty coverage ends. ${DATE_HINT}`),
});

export type WarrantyExtraction = z.infer<typeof warrantyExtractionSchema>;

// ----- Document classification -----

export const documentClassificationSchema = z.object({
  title: z
    .string()
    .nullable()
    .describe("A concise, descriptive title for the document."),
  document_type: z
    .string()
    .nullable()
    .describe(
      "Best category: Insurance, Warranty, Manual, Receipt, Contract, Permit, Tax, Inspection, Statement, or Other.",
    ),
  issued_on: z.string().nullable().describe(`Date the document was issued. ${DATE_HINT}`),
  expires_on: z
    .string()
    .nullable()
    .describe(`Date the document or coverage expires/renews. ${DATE_HINT}`),
  summary: z
    .string()
    .nullable()
    .describe("One or two sentences describing the document in plain language."),
  reminder_suggested: z
    .boolean()
    .describe("True only if there is a meaningful future date worth reminding the user about."),
  reminder_title: z
    .string()
    .nullable()
    .describe("If a reminder is suggested, a short actionable title, e.g. 'Renew home insurance'."),
  reminder_date: z
    .string()
    .nullable()
    .describe(`If a reminder is suggested, when it should be due. ${DATE_HINT}`),
});

export type DocumentClassification = z.infer<typeof documentClassificationSchema>;

// ----- Maintenance plan generation -----

export const maintenancePlanSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().describe("Specific, actionable task title."),
        category: z
          .string()
          .describe("System this applies to: HVAC, Plumbing, Electrical, Exterior, Safety, Appliance, General."),
        recurrence: z
          .string()
          .describe("How often: monthly, quarterly, biannual, annual, or one-time."),
        month_hint: z
          .string()
          .describe("Best month or season to do it first, e.g. 'March' or 'Early fall'."),
        reason: z
          .string()
          .describe("One sentence on why it matters for this specific home. Under 160 chars."),
        priority: z.enum(["high", "normal", "low"]).describe("Relative importance."),
      }),
    )
    .min(4)
    .max(10)
    .describe("A tailored seasonal maintenance plan for this home."),
});

export type MaintenancePlan = z.infer<typeof maintenancePlanSchema>;

// ----- Shared helpers -----

function fileContent(file: AiFilePart) {
  return {
    type: "file" as const,
    data: file.data,
    mediaType: file.mediaType,
    filename: file.filename,
  };
}

async function extractFromFile<T>(
  schema: z.ZodType<T>,
  instruction: string,
  file: AiFilePart,
): Promise<T> {
  const { output } = await generateText({
    model: AI_MODELS.vision,
    output: Output.object({ schema }),
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: instruction }, fileContent(file)],
      },
    ],
  });
  return output as T;
}

export function extractAppliance(file: AiFilePart) {
  return extractFromFile(
    applianceExtractionSchema,
    "You are helping a homeowner catalog a home appliance or system. Extract the structured details from this photo of the unit, its rating label, spec sticker, or receipt. Only use information clearly visible.",
    file,
  );
}

export function extractWarranty(file: AiFilePart) {
  return extractFromFile(
    warrantyExtractionSchema,
    "Extract warranty details from this document or photo (warranty card, receipt, or coverage letter). Only use information clearly present.",
    file,
  );
}

export function classifyDocument(file: AiFilePart) {
  return extractFromFile(
    documentClassificationSchema,
    "Classify this household document and extract key metadata. Suggest a reminder only if there is a genuine renewal/expiry/deadline date in the future that the homeowner would want to be reminded about.",
    file,
  );
}

export type HomeProfileForPlan = {
  homeType: string | null;
  ownershipType: string | null;
  yearBuilt: number | null;
  city: string | null;
  province: string | null;
  country: string | null;
  knownSystems: string[];
};

export async function generateMaintenancePlan(profile: HomeProfileForPlan) {
  const today = new Date().toISOString().slice(0, 10);
  const profileLines = [
    `Today's date: ${today}`,
    `Home type: ${profile.homeType ?? "unknown"}`,
    `Ownership: ${profile.ownershipType ?? "unknown"}`,
    `Approx. year built: ${profile.yearBuilt ?? "unknown"}`,
    `Location: ${[profile.city, profile.province, profile.country].filter(Boolean).join(", ") || "unknown"}`,
    `Known appliances/systems already tracked: ${
      profile.knownSystems.length ? profile.knownSystems.join(", ") : "none recorded yet"
    }`,
  ].join("\n");

  const { output } = await generateText({
    model: AI_MODELS.text,
    output: Output.object({ schema: maintenancePlanSchema }),
    system:
      "You are a seasoned home-maintenance advisor. Produce a practical, seasonal upkeep plan tailored to the specific home described. Favor tasks that prevent expensive damage and safety issues. Account for the local climate implied by the location and the home's age. Avoid duplicating systems the homeowner clearly does not have. Keep tasks concrete and homeowner-doable or clearly worth hiring out.",
    messages: [
      {
        role: "user",
        content: `Create a tailored home maintenance plan for this home:\n\n${profileLines}`,
      },
    ],
  });

  return output;
}

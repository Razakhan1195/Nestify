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

// ----- Bill extraction (AI upload) -----

export const billExtractionSchema = z.object({
  provider: z
    .string()
    .nullable()
    .describe("The company/provider that issued the bill, e.g. 'Toronto Hydro', 'Rogers', 'Enbridge Gas'."),
  bill_title: z
    .string()
    .nullable()
    .describe("A short name for the bill, usually the provider plus the service, e.g. 'Toronto Hydro electricity'."),
  category: z
    .string()
    .nullable()
    .describe("Best category: Electricity, Gas, Water, Internet, Phone, Insurance, Property tax, Rent, or Other."),
  amount: z
    .number()
    .nullable()
    .describe("Total amount due on this bill as a number (no currency symbol). Use the amount due, not previous balance."),
  due_date: z.string().nullable().describe(`The payment due date. ${DATE_HINT}`),
  issue_date: z.string().nullable().describe(`The date the bill was issued/created. ${DATE_HINT}`),
  billing_cycle: z
    .string()
    .nullable()
    .describe("Billing frequency if shown: monthly, quarterly, bimonthly, or annual."),
  account_number: z
    .string()
    .nullable()
    .describe("Account or reference number exactly as printed. If long, the last 4-6 digits are fine."),
  notes: z
    .string()
    .nullable()
    .describe("Any other useful detail such as usage or a notable change. Keep under 160 chars."),
});

export type BillExtraction = z.infer<typeof billExtractionSchema>;

export function extractBill(file: AiFilePart) {
  return extractFromFile(
    billExtractionSchema,
    "You are reading a household utility, telecom, insurance, tax, or rent bill for a homeowner. Extract the structured payment details. Use the total amount currently due. Only use information clearly present on the document.",
    file,
  );
}

// ----- Repair diagnosis (AI DIY help) -----

export const repairDiagnosisSchema = z.object({
  summary: z
    .string()
    .describe("One or two plain-language sentences summarizing what is most likely going on."),
  likely_causes: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe("The most likely causes, most probable first. Each a short phrase."),
  steps: z
    .array(z.string())
    .min(1)
    .max(6)
    .describe("Simple, ordered troubleshooting steps a homeowner can safely try."),
  safety_warnings: z
    .array(z.string())
    .max(4)
    .describe("Any safety warnings. Empty array if none are relevant."),
  recommendation: z
    .enum(["diy", "monitor", "professional"])
    .describe("'diy' if homeowner can likely handle it, 'monitor' if watch-and-wait, 'professional' if a pro is needed."),
  recommendation_reason: z
    .string()
    .describe("One sentence explaining the recommendation."),
  urgency: z
    .enum(["low", "normal", "high"])
    .describe("How time-sensitive this is."),
  suggested_title: z
    .string()
    .describe("A concise repair title to use if the user logs this, e.g. 'Dishwasher leaking from door'."),
  suggested_category: z
    .string()
    .describe("System/area: Plumbing, HVAC, Electrical, Appliance, Roof & exterior, or General."),
});

export type RepairDiagnosis = z.infer<typeof repairDiagnosisSchema>;

export async function diagnoseRepair(input: {
  description: string;
  location?: string | null;
  file?: AiFilePart | null;
}) {
  const context = [
    `Homeowner's description: ${input.description}`,
    input.location ? `Location/room: ${input.location}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const content: Array<
    { type: "text"; text: string } | ReturnType<typeof fileContent>
  > = [
    {
      type: "text",
      text: `Diagnose this home issue and give safe, practical guidance.\n\n${context}`,
    },
  ];
  if (input.file) content.push(fileContent(input.file));

  const { output } = await generateText({
    model: input.file ? AI_MODELS.vision : AI_MODELS.text,
    output: Output.object({ schema: repairDiagnosisSchema }),
    system:
      "You are a careful, experienced home-repair advisor helping a homeowner triage an issue. Be practical and concise. Prioritize safety: if there is any risk of gas, fire, electrical shock, flooding, or structural damage, say so clearly and recommend a professional. Never overstate confidence. Tailor steps to what a typical homeowner can safely do.",
    messages: [{ role: "user", content }],
  });

  return output;
}

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

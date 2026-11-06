import { z } from "zod";

const optionalDateSchema = z
  .string()
  .refine(
    (value) =>
      !value ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value),
    "Choose a valid date.",
  )
  .optional();

const moneySchema = z.string().trim().regex(/^-?\d{1,10}(?:\.\d{1,2})?$/, "Enter an amount with no more than two decimal places.");
const periodFields = { billing_period_start: optionalDateSchema, billing_period_end: optionalDateSchema };
function validatePeriod(value: { billing_period_start?: string; billing_period_end?: string }, ctx: z.RefinementCtx) {
  if (Boolean(value.billing_period_start) !== Boolean(value.billing_period_end)) {
    ctx.addIssue({ code: "custom", path: [value.billing_period_start ? "billing_period_end" : "billing_period_start"], message: "Enter both dates for the billing period." });
  }
  if (value.billing_period_start && value.billing_period_end && value.billing_period_end < value.billing_period_start) {
    ctx.addIssue({ code: "custom", path: ["billing_period_end"], message: "The period must end on or after it starts." });
  }
}

export const manualBillSchema = z.object({
  bill_title: z.string().trim().min(1, "Enter a bill title.").max(140),
  category: z.string().trim().min(1, "Choose a category.").max(80),
  provider_id: z.string().uuid().optional().or(z.literal("")),
  provider_name: z.string().trim().max(120).optional(),
  issue_date: optionalDateSchema,
  ...periodFields,
  record_kind: z.enum(["current", "historical"]).optional(),
  amount: moneySchema,
  amount_paid: z
    .string()
    .optional()
    .refine(
      (value) => !value || Number.isFinite(Number(value)),
      "Enter a valid amount paid.",
    ),
  due_date: optionalDateSchema.unwrap(),
  frequency: z.string().trim().optional(),
  payment_status: z.enum(["unpaid", "scheduled", "paid", "overdue"]).optional(),
  account_number: z.string().trim().max(80).optional(),
  reminder_date: optionalDateSchema,
  notes: z.string().trim().optional(),
}).superRefine((value, ctx) => {
  validatePeriod(value, ctx);
  if (value.record_kind === "historical") {
    for (const [key, message] of [
      ["provider_name", "Enter the provider shown on the statement."],
      ["account_number", "Add an account nickname to keep this history together."],
      ["billing_period_start", "Choose the statement period start."],
      ["billing_period_end", "Choose the statement period end."],
    ] as const) {
      if (!value[key]) ctx.addIssue({ code: "custom", path: [key], message });
    }
    if (value.provider_id) ctx.addIssue({ code: "custom", path: ["provider_id"], message: "Save manual history separately from a connected account." });
    // An issued statement can charge in advance (for example, monthly telecom).
    // Service-period completion is not a condition for saving billed charges.
    const today = new Date().toISOString().slice(0, 10);
    if (value.issue_date && value.issue_date > today) {
      ctx.addIssue({ code: "custom", path: ["issue_date"], message: "Check the issue date. The statement must already have been issued." });
    }
    if (value.billing_period_end && value.billing_period_end > today && !value.issue_date) {
      ctx.addIssue({ code: "custom", path: ["issue_date"], message: "Check the issue date shown on this advance-billed statement." });
    }
  } else if (!value.due_date) {
    ctx.addIssue({ code: "custom", path: ["due_date"], message: "Choose a due date." });
  }
});

export const billDetailsSchema = z.object({
  bill_id: z.string().uuid(),
  amount: moneySchema.optional().or(z.literal("")),
  name: z.string().trim().max(140).optional(),
  category: z.string().trim().max(80).optional(),
  due_date: optionalDateSchema.unwrap(),
  ...periodFields,
  provider_name: z.string().trim().max(120).optional(),
  account_number: z.string().trim().max(80).optional(),
}).superRefine(validatePeriod);
export const billDeleteSchema = z.object({
  bill_id: z.string().uuid(),
});

export type ManualBillInput = z.infer<typeof manualBillSchema>;
export type BillDetailsInput = z.infer<typeof billDetailsSchema>;

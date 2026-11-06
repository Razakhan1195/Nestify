import { z } from "zod";

const optionalDateSchema = z
  .string()
  .refine(
    (value) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))),
    "Choose a valid date.",
  )
  .optional()
  .default("");

export const maintenanceTaskSchema = z.object({
  title: z.string().trim().min(1, "Enter a task title.").max(140),
  category: z.string().trim().min(1, "Choose a task type.").max(80),
  due_date: optionalDateSchema,
  recurrence: z.string().trim().max(80).optional().default(""),
  priority: z.enum(["high", "normal", "low"]).optional().default("normal"),
  description: z.string().trim().max(1000).optional().default(""),
  relevance: z.string().trim().max(200).optional().default(""),
});

export type MaintenanceTaskInput = z.infer<typeof maintenanceTaskSchema>;

export const maintenancePlanTasksSchema = z
  .array(
    z.object({
      title: z.string().trim().min(1).max(160),
      category: z.string().trim().max(80).optional().default(""),
      recurrence: z.string().trim().max(80).optional().default(""),
      due_date: optionalDateSchema,
      description: z.string().trim().max(400).optional().default(""),
      priority: z.enum(["high", "normal", "low"]).optional().default("normal"),
    }),
  )
  .min(1)
  .max(12);

export type MaintenancePlanTaskInput = z.infer<typeof maintenancePlanTasksSchema>[number];

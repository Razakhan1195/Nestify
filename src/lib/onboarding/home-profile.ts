import { z } from "zod";

import { homeTypeOptions, ownershipTypeOptions } from "@/lib/onboarding/config";

const blankIfMissing = (value: unknown) => value == null ? "" : value;
const optionalText = (max: number, message: string) => z.preprocess(
  blankIfMissing, z.string().trim().max(max, message),
);
const optionalDateSchema = z.preprocess(blankIfMissing, z.string().trim().refine(
  value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value),
  "Use a valid date in YYYY-MM-DD format, or leave it blank.",
));

export const homeProfileSchema = z.object({
  nickname: z.string().trim().min(1, "Enter a home nickname.").max(80, "Use up to 80 characters."),
  street_address: optionalText(160, "Use up to 160 characters."),
  city: z.string().trim().min(1, "Enter your city.").max(100, "Use up to 100 characters."),
  province: z.string().trim().min(1, "Choose your province or territory.").max(80, "Use up to 80 characters."),
  postal_code: z.preprocess(blankIfMissing, z.string().trim().refine(
    value => !value || /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/.test(value.toUpperCase()),
    "Enter a Canadian postal code, such as A1A 1A1, or leave it blank.",
  )),
  home_type: z.preprocess(blankIfMissing, z.string().trim().refine(
    value => !value || homeTypeOptions.some(option => option === value),
    "Choose a home type or leave it blank.",
  )),
  ownership_type: z.preprocess(blankIfMissing, z.string().trim().refine(
    value => !value || ownershipTypeOptions.some(option => option === value),
    "Choose a living situation or leave it blank.",
  )),
  closing_date: optionalDateSchema,
  approximate_year_built: z.preprocess(blankIfMissing, z.string().trim().refine(
    value => !value || (/^\d{4}$/.test(value) && Number(value) >= 1600 && Number(value) <= 2100),
    "Enter a year from 1600 to 2100, or leave it blank.",
  )),
});

export type HomeProfileInput = z.infer<typeof homeProfileSchema>;

export function homeProfileValidationMessage(errors: Partial<Record<keyof HomeProfileInput, string[]>>) {
  const labels: Record<keyof HomeProfileInput, string> = {
    nickname: "Home nickname", street_address: "Street address", city: "City",
    province: "Province or territory", postal_code: "Postal code", home_type: "Home type",
    ownership_type: "Living situation", closing_date: "Move-in or closing date",
    approximate_year_built: "Approximate year built",
  };
  return (Object.keys(labels) as (keyof HomeProfileInput)[])
    .filter(key => errors[key]?.length)
    .map(key => labels[key] + ": " + errors[key]![0])
    .join("\n") || "Check your place details and try again.";
}

export function homeProfileToDatabase(values: HomeProfileInput) {
  return {
    nickname: values.nickname,
    street_address: values.street_address || null,
    city: values.city || null,
    province: values.province || null,
    postal_code: values.postal_code || null,
    country: "Canada",
    home_type: values.home_type || null,
    ownership_type: values.ownership_type || null,
    closing_date: values.closing_date || null,
    approximate_year_built: values.approximate_year_built ? Number(values.approximate_year_built) : null,
  };
}

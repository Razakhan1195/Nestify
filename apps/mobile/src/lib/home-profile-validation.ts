import { validPostalCode } from "./canadian-address";
import type { SetupForm as HomeProfileInput } from "./onboarding-draft-core";

export const homeProfileLabels = {
  display_name: "Preferred name",
  nickname: "Home nickname",
  street_address: "Street address",
  city: "City",
  province: "Province or territory",
  postal_code: "Postal code",
  home_type: "Home type",
  ownership_type: "Living situation",
  closing_date: "Move-in or closing date",
  approximate_year_built: "Approximate year built",
} as const;
export type HomeProfileField = keyof typeof homeProfileLabels;
export type HomeProfileErrors = Partial<Record<HomeProfileField, string>>;
const optionalFields: HomeProfileField[] = ["nickname", "street_address", "postal_code", "home_type", "ownership_type", "closing_date", "approximate_year_built"];
export function hasOptionalHomeDetails(form: HomeProfileInput) {
  return optionalFields.some(key => key === "nickname" ? Boolean(form.nickname.trim() && form.nickname.trim() !== "Home") : Boolean(form[key as keyof HomeProfileInput]?.trim()));
}
export function hasOptionalHomeErrors(errors: HomeProfileErrors) {
  return optionalFields.some(key => Boolean(errors[key]));
}
export function homeProfileErrorSummary(errors: HomeProfileErrors) {
  return (Object.keys(homeProfileLabels) as HomeProfileField[])
    .filter(key => errors[key])
    .map(key => homeProfileLabels[key] + ": " + errors[key])
    .join("\n");
}
export function readHomeProfileErrors(details: unknown): HomeProfileErrors {
  if (!details || typeof details !== "object" || !("fieldErrors" in details)) return {};
  const fields = details.fieldErrors;
  if (!fields || typeof fields !== "object") return {};
  const result: HomeProfileErrors = {};
  for (const key of Object.keys(homeProfileLabels) as HomeProfileField[]) {
    const value = (fields as Record<string, unknown>)[key];
    const first = Array.isArray(value) ? value.find(item => typeof item === "string" && item.trim()) : undefined;
    if (first) result[key] = first.slice(0, 300);
  }
  return result;
}
export function validateHomeProfile(
  form: HomeProfileInput,
  options: { homeTypeOptions: readonly string[]; ownershipTypeOptions: readonly string[] },
  displayName = "",
): HomeProfileErrors {
  const errors: HomeProfileErrors = {};
  const name = displayName.trim();
  if (name.length > 100 || /[\u0000-\u001f\u007f]/u.test(name)) errors.display_name = "Enter a name of up to 100 characters.";
  if (form.nickname.trim().length > 80) errors.nickname = "Use up to 80 characters.";
  if ((form.street_address ?? "").trim().length > 160) errors.street_address = "Use up to 160 characters.";
  if (!form.city.trim()) errors.city = "Enter your city.";
  else if (form.city.trim().length > 100) errors.city = "Use up to 100 characters.";
  if (!form.province.trim()) errors.province = "Choose your province or territory.";
  else if (form.province.trim().length > 80) errors.province = "Use up to 80 characters.";
  if (form.postal_code.trim() && !validPostalCode(form.postal_code)) errors.postal_code = "Enter a Canadian postal code, such as A1A 1A1, or leave it blank.";
  if (form.home_type.trim() && !options.homeTypeOptions.includes(form.home_type.trim())) errors.home_type = "Choose a home type or leave it blank.";
  if (form.ownership_type.trim() && !options.ownershipTypeOptions.includes(form.ownership_type.trim())) errors.ownership_type = "Choose a living situation or leave it blank.";
  const year = (form.approximate_year_built ?? "").trim();
  if (year && (!/^\d{4}$/.test(year) || Number(year) < 1600 || Number(year) > 2100)) errors.approximate_year_built = "Enter a year from 1600 to 2100, or leave it blank.";
  const date = (form.closing_date ?? "").trim();
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) errors.closing_date = "Use a valid date in YYYY-MM-DD format, or leave it blank.";
  return errors;
}

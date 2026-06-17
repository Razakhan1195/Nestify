export type SchemaErrorLike = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
};

export const homeownerOsMigrationPath =
  "supabase/migrations/202606170001_homeowner_os_foundation.sql";

export const homeownerOsMigrationMessage =
  "The Homeowner OS database migration has not been run yet. Run supabase/migrations/202606170001_homeowner_os_foundation.sql in the Supabase SQL Editor, then refresh this page.";

export function isMissingSchemaError(error: SchemaErrorLike | null | undefined) {
  if (!error) return false;

  const code = error.code ?? "";
  const message = `${error.message ?? ""} ${error.details ?? ""} ${
    error.hint ?? ""
  }`.toLowerCase();

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST200" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("does not exist")
  );
}

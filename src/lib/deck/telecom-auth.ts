import type { DeckV2Interaction } from "./v2-client";
export class DeckVerificationInputError extends Error {}
export const ROGERS_REGISTRY_ID = "11d2d635-9635-4971-bc49-809919b0b90d";
export function isCodeInteraction(interaction: DeckV2Interaction | null | undefined) {
 return interaction?.type === "mfa" && interaction.fields?.length === 1 &&
  interaction.fields[0].name === "code" && !interaction.fields[0].options?.length &&
  (!interaction.fields[0].type || ["string", "number"].includes(interaction.fields[0].type));
}
export function normalizeRogersVerification(registryId: string | null | undefined, interaction: DeckV2Interaction | null | undefined, values: Record<string, string | boolean>) {
 if (registryId !== ROGERS_REGISTRY_ID || !isCodeInteraction(interaction)) return values;
 const code = typeof values.code === "string" ? values.code.replace(/[\s\u200B-\u200D\uFEFF-]/g, "") : "";
 if (!/^\d{6}$/.test(code)) throw new DeckVerificationInputError("Enter the full six-digit Rogers code from your most recent email. Your code has not been submitted.");
 return { ...values, code };
}
export function telecomFailureMessage(code: string, saved: number) {
 const retained = saved ? " Your saved bills are still available." : " No statements were imported.";
 if (code === "timeout") return "The bill import reached its time limit before finishing." + retained;
 if (code === "credential_invalid") return "Your provider could not accept the saved login. Sign in again to continue." + retained;
 if (code === "interaction_timeout") return "Verification expired before the import could continue." + retained;
 if (code === "initial_result_timeout") return "Rogers did not return bills or a verification request in time. We stopped this attempt." + retained;
 if (code === "unsupported_security_key") return "Rogers opened a security-key prompt that Rezlee could not complete. This connection needs a fix before you try again." + retained;
 if (code === "verification_loop") return "Verification did not finish. We stopped this attempt to prevent more repeated prompts." + retained;
 return "Rezlee couldn’t finish this provider connection. It did not return a specific reason." + retained;
}
export const rogersAuthenticationInstructions = [
 "ROGERS SIGN-IN REQUIREMENTS: If sign-in is needed, follow this order: enter the stored username, click Continue once, click Cancel on the optional passkey/security-key prompt, then enter the stored password on the password screen and continue through normal email verification if Rogers requires it. Use the existing browser session; do not start another login while one is in progress.",
 "The optional prompt may say Passkeys & Security Keys, Use your security key with account.rogers.com, or Insert your security key and touch it. Click its visible Cancel button. This is a browser-native dialog outside the webpage DOM: use the available full-browser/desktop view and native click control. Do not select a security key, scan a passkey QR code, or wait for the user to supply a passkey. Do not use DOM inspection as proof that this prompt is absent.",
 "After Cancel, confirm the password input is actually visible and enabled before entering the stored password. A hidden password input or a username-only page is not a successful transition. If Cancel cannot be operated or the password form does not appear within 30 seconds, stop with the observed failure. Do not refresh, reload, restart sign-in, reset the password, or change passkeys/MFA settings. Never log or return any credential or code.",
 "When Rogers displays a six-digit code form, request the user's code once through an interaction field named code. Codes are strings; preserve leading zeros. Never echo a code in messages, reasoning or output.",
 "Inspect the actual visible input controls. If there are six separate one-character inputs, populate one digit per field with real input/change events; never put the full code into one one-character field. If there is one input, enter all six digits there. Confirm all six positions are populated without disclosing their values before pressing Continue once.",
 "A message such as Please enter a valid 6-digit code is a form-entry/format problem, not proof the user's code was rejected. Correct the input mechanism once using the same supplied code; do not request a different code for this condition.",
 "Never click Resend code automatically. If the page explicitly says the completed code is incorrect or expired, ask the user through a select interaction whether to send a new code or stop. Resend only after the user selects send_new_code. Stop when they select stop. Allow at most one explicitly approved resend per task.",
 "After submitting the verification code, wait for navigation. On rogers.com/consumer/self-serve/overview showing Please wait or do not press back or refresh, allow up to 90 seconds for the portal to load, checking about every 5 seconds. Do not refresh, go back, restart login, or request another code during this handoff.",
 "If sign-in cannot finish, stop and return the observed failure; do not keep requesting verification or claim that the user entered a wrong code without evidence."
].join(" ");

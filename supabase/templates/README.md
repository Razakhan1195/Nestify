# Rezlee authentication email templates

Prepared 2026-09-25. These source files do not configure hosted Supabase automatically.

- Confirm signup: confirmation.html; subject: Confirm your email for Rezlee.
- Password recovery: recovery.html; subject: Reset your Rezlee password.
- Keep the existing `{{ .ConfirmationURL }}` token and configured redirect flow intact.
- No tracking pixels, externally fetched graphics, promotional content or interpolated user metadata.
- Sender display name: Rezlee. Use the verified Rezlee sending address in the existing Resend account; do not invent or use an unverified From address.
- Configure custom SMTP on the intended Supabase project using provider credentials through its protected settings. Do not put passwords in this directory, mobile code or logs.
- The ordinary magic-link/sign-in-code template and its gates are separate from password recovery. Recovery now supports `{{ .Token }}` through the isolated recovery client; keep both that token and the existing confirmation URL.

Acceptance before release: send to an explicitly authorized test inbox; inspect actual From and branding, SPF/DKIM/DMARC delivery results, confirmation and reset links, expired/resend behavior and native return. A template render or admin-confirmed test account is not delivery verification. Keep production separate from staging and preserve previous settings for rollback.

References checked: https://supabase.com/docs/guides/auth/auth-smtp and https://supabase.com/docs/guides/auth/auth-email-templates .

## Hosted staging status — 2026-09-25
Confirmation/recovery templates and custom Resend SMTP are now configured on staging gjwvalpxnfbvryosmcbj and verified by management API read-back. Production unchanged. SMTP credential acceptance succeeded; no messages sent and inbox/link journeys remain unverified. See docs/staging-auth-email-verification-2026-09-25.json.

## Customer recovery update — 2026-10-12
Staging reset email now includes a code for the mobile Password help screen plus the existing reset link. The code can be read on any device and entered on the requesting phone; this works around custom-scheme handoff in Expo Go. Codes use Supabase recovery verification, never ordinary sign-in. The confirmation email welcomes the customer with one confirmation action and three optional starting ideas. These templates are applied to staging only. The exact mobile signup return `https://staging.rezlee.com/auth/mobile-confirmed` is now allowed. The later customer-communications-2026-10-12.md increment adds a separate one-time welcome after verified mobile app entry, enabled for new staging accounts after its rollout cutoff. Actual mailbox delivery and OS handoff remain acceptance gates. See customer-auth-finish-2026-10-12.md.

## Full family and security update — 2026-10-12

All eleven remaining auth/security bodies in family.json were applied to staging and read back; confirmation/recovery were preserved. Regenerate the eleven templates with node scripts/qa/build-auth-email-family.cjs. The magic-link template preserves Token and ConfirmationURL; email change preserves NewEmail and ConfirmationURL. Password changed is ON in staging; the other six security switches remain OFF. No test messages were sent. See customer-communications-2026-10-12.md for delivery boundaries, rollback and the combined phone checklist.

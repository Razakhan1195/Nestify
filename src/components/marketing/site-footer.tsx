import { RezleeLogo } from "@/components/brand/rezlee-logo";
import Link from "next/link";

export function SiteFooter() {
  const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  const privacy = process.env.NEXT_PUBLIC_PRIVACY_URL;
  const terms = process.env.NEXT_PUBLIC_TERMS_URL;
  return (
    <footer className="border-t border-[color:var(--border-soft)] bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2.5">
          <RezleeLogo />
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link
            className="transition-colors hover:text-foreground"
            href="/#how-it-works"
          >
            How it works
          </Link>
          <Link
            className="transition-colors hover:text-foreground"
            href="/#features"
          >
            Features
          </Link>
          <Link
            className="transition-colors hover:text-foreground"
            href="/#faq"
          >
            FAQ
          </Link>
          <Link
            className="transition-colors hover:text-foreground"
            href="/login"
          >
            Sign in
          </Link>
          {support && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(support) ? (
            <a href={`mailto:${support}`}>Contact</a>
          ) : null}
          {privacy?.startsWith("https://") ? (
            <a href={privacy}>Privacy</a>
          ) : null}
          {terms?.startsWith("https://") ? <a href={terms}>Terms</a> : null}
        </nav>

        <p className="text-xs text-muted-foreground">
          {`\u00A9 ${new Date().getFullYear()} Rezlee. Your place, under control.`}
        </p>
      </div>
    </footer>
  );
}

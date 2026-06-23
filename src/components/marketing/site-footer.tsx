import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-[color:var(--border-soft)] bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
            N
          </span>
          <span className="text-sm font-semibold tracking-tight">Nestify</span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link className="transition-colors hover:text-foreground" href="#how-it-works">
            How it works
          </Link>
          <Link className="transition-colors hover:text-foreground" href="#features">
            Features
          </Link>
          <Link className="transition-colors hover:text-foreground" href="#faq">
            FAQ
          </Link>
          <Link className="transition-colors hover:text-foreground" href="/login">
            Sign in
          </Link>
        </nav>

        <p className="text-xs text-muted-foreground">
          {`\u00A9 ${new Date().getFullYear()} Nestify. Your household command center.`}
        </p>
      </div>
    </footer>
  );
}

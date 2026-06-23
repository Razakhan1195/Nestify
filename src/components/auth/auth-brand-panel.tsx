import Image from "next/image";
import Link from "next/link";
import { CalendarClock, FileText, ReceiptText, ShieldCheck } from "lucide-react";

const points = [
  { icon: ReceiptText, text: "Track bills, rent, and renewals before they're due" },
  { icon: CalendarClock, text: "Stay ahead of maintenance and seasonal upkeep" },
  { icon: FileText, text: "Keep documents, receipts, and warranties in one vault" },
  { icon: ShieldCheck, text: "A calm monthly view of everything that runs your home" },
];

export function AuthBrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-secondary lg:flex lg:flex-col lg:justify-between">
      <Image
        alt=""
        aria-hidden
        className="absolute inset-0 size-full object-cover opacity-25"
        fill
        priority
        sizes="50vw"
        src="/marketing/hero-home.png"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-secondary/60 via-secondary/80 to-secondary"
      />
      <div className="relative z-10 p-10">
        <Link className="text-lg font-semibold text-secondary-foreground" href="/">
          Nestify
        </Link>
      </div>
      <div className="relative z-10 flex flex-col gap-6 p-10">
        <h2 className="max-w-sm text-2xl font-semibold leading-snug tracking-tight text-secondary-foreground text-balance">
          Everything that keeps your home running, in one calm place.
        </h2>
        <ul className="flex flex-col gap-3">
          {points.map((point) => {
            const Icon = point.icon;
            return (
              <li className="flex items-center gap-3 text-sm text-secondary-foreground/90" key={point.text}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card/70 text-primary">
                  <Icon className="size-4" />
                </span>
                {point.text}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

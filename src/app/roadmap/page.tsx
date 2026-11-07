import Link from "next/link";
import { RoadmapBoard } from "./roadmap-board";
export const metadata = { title: "Build Rezlee with us · Customer roadmap", description: "Suggest an improvement, vote on ideas, and see what Rezlee is working on. Our small team responds with a decision within seven days." };
export default function RoadmapPage() {
 return <main className="min-h-screen bg-background text-foreground">
  <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6"><Link href="/" className="text-2xl font-semibold tracking-tight">rezlee</Link><Link href="/app" className="text-sm font-semibold text-primary">Open Rezlee →</Link></nav>
  <div className="mx-auto grid max-w-6xl gap-6 px-5 pb-16 pt-4 lg:gap-10 lg:grid-cols-[280px_minmax(0,1fr)]">
   <header className="space-y-4 lg:sticky lg:top-8 lg:self-start">
    <h1 className="font-serif text-3xl leading-tight lg:text-4xl">Help shape Rezlee.</h1>
    <p className="leading-relaxed text-muted-foreground">We’re a small team building with you. Tell us what would make life at home easier.</p>
    <p className="text-sm leading-relaxed font-medium">We’ll reply here within seven calendar days with a decision, priority and reason.</p>
    <details className="text-sm leading-relaxed text-muted-foreground"><summary className="min-h-11 cursor-pointer py-2 font-semibold text-primary">How we prioritize</summary><p className="pb-4">Votes help us understand what matters. We also weigh customer needs, effort and reliability. Planned work can change; it isn’t a promised delivery date.</p><Link href="/contact" className="inline-block pb-2 font-semibold text-primary underline underline-offset-4">Need help with your account?</Link></details>
   </header>
   <RoadmapBoard/>
  </div>
 </main>;
}

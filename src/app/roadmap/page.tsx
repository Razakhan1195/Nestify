import { redirect } from "next/navigation";
export const metadata = { title: "Rezlee roadmap", robots: { index: false, follow: false } };
export default function RoadmapPage() { redirect("/open?screen=roadmap"); }

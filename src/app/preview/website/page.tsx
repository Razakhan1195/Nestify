import { notFound } from "next/navigation";
import { WebsitePreview } from "./website-preview";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "Rezlee website review" };
export default function Page() {
  if (process.env.NEXT_PUBLIC_APP_URL !== "https://staging.rezlee.com") notFound();
  return <WebsitePreview />;
}

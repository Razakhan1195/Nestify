import { redirect } from "next/navigation";

export default function HomeProfileRedirect() {
  redirect("/app/settings");
}

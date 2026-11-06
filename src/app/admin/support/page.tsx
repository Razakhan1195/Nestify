import {redirect} from "next/navigation";
import {supportAccess} from "@/lib/ops/support";
import {SupportWorkspace} from "./workspace";
export const dynamic="force-dynamic";
export default async function Page(){if(!await supportAccess())redirect("/admin/access");return <SupportWorkspace/>;}

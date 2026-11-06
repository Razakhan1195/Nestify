import {redirect} from "next/navigation";
import {supportAccess} from "@/lib/ops/support";
import {GiftWorkspace} from "./workspace";
export const dynamic="force-dynamic";
export default async function Page(){if(!(await supportAccess())?.owner)redirect("/admin/access");return <GiftWorkspace/>;}

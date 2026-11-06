import {readFileSync,writeFileSync,mkdirSync,chmodSync} from "node:fs";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {createClient} from "@supabase/supabase-js";
const settings=JSON.parse(readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,"utf8"));
if(settings.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Isolated staging only");
const dir=process.env.REZLEE_BACKUP_PATH;
if(!dir||!dir.startsWith("/Users/razakhan/Library/Application Support/Rezlee/restore-rehearsal-"))throw Error("Use a protected local backup directory");
mkdirSync(join(dir,"objects"),{recursive:true,mode:0o700});chmodSync(dir,0o700);chmodSync(join(dir,"objects"),0o700);
const db=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const buckets=await db.storage.listBuckets();if(buckets.error)throw Error("Could not list backup buckets");
const manifest={createdAt:new Date().toISOString(),buckets:buckets.data,objects:[]};let total=0;
async function walk(bucket,prefix=""){
 for(let offset=0;;offset+=100){
  const r=await db.storage.from(bucket).list(prefix,{limit:100,offset,sortBy:{column:"name",order:"asc"}});
  if(r.error)throw Error("Could not inventory storage");
  for(const o of r.data){
   const path=prefix?prefix+"/"+o.name:o.name;
   if(!o.id){await walk(bucket,path);continue;}
   const size=Number(o.metadata?.size??0);if(!Number.isFinite(size)||size<0||total+size>256*1024*1024)throw Error("Backup exceeds this rehearsal's 256 MB scope");
   const blob=await db.storage.from(bucket).download(path);if(blob.error)throw Error("Could not back up an original");
   const bytes=Buffer.from(await blob.data.arrayBuffer());total+=bytes.length;if(total>256*1024*1024)throw Error("Backup exceeds bounded size");
   const sha256=createHash("sha256").update(bytes).digest("hex"),name=createHash("sha256").update(bucket+"\0"+path).digest("hex");
   const file=join(dir,"objects",name);writeFileSync(file,bytes,{mode:0o600});chmodSync(file,0o600);
   manifest.objects.push({bucket,path,id:o.id,size:bytes.length,sha256,file:"objects/"+name,metadata:o.metadata,updatedAt:o.updated_at});
  }
  if(r.data.length<100)break;
 }
}
for(const b of buckets.data)await walk(b.id);
const manifestFile=join(dir,"storage-manifest.json");writeFileSync(manifestFile,JSON.stringify(manifest,null,2),{mode:0o600});chmodSync(manifestFile,0o600);
console.log(JSON.stringify({buckets:buckets.data.length,objects:manifest.objects.length,bytes:total,allObjectsHashed:true}));

import {readFileSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
const require=createRequire(process.cwd()+"/package.json");
const {createClient}=require("@supabase/supabase-js");
if(!process.env.REZLEE_STAGING_QA_SETTINGS)throw Error("Set REZLEE_STAGING_QA_SETTINGS to an external staging credentials file; never commit it.");
const settings=JSON.parse(readFileSync(process.env.REZLEE_STAGING_QA_SETTINGS,"utf8"));
if(settings.NEXT_PUBLIC_SUPABASE_URL!=="https://gjwvalpxnfbvryosmcbj.supabase.co")throw Error("Staging only");
const base="https://staging.rezlee.com",options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.SUPABASE_SECRET_KEY,options),fixtures=[],checks=[];
let failure=null;
function check(name,ok){if(!ok)throw Error(name);checks.push(name);console.log("PASS",name);}
async function account(){
 const email=`quote-qa-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{qa_marker:true}});
 if(made.error)throw Error("Disposable user creation failed");
 const f={id:made.data.user.id,client:createClient(settings.NEXT_PUBLIC_SUPABASE_URL,settings.NEXT_PUBLIC_SUPABASE_ANON_KEY,options)};fixtures.push(f);
 const login=await f.client.auth.signInWithPassword({email,password});if(login.error)throw Error("Disposable sign-in failed");f.token=login.data.session.access_token;
 const home=await f.client.from("homes").insert({user_id:f.id,nickname:"Disposable quote QA",city:"Pickering",province:"Ontario",home_type:"house",ownership_type:"owner"}).select("id").single();if(home.error)throw Error("Disposable home failed");f.home=home.data.id;return f;
}

async function doc(f,title="Synthetic installation quote"){
 const r=await f.client.from("documents").insert({user_id:f.id,home_id:f.home,title,notes:"Proposed installation. CAD 800 plus tax.",source:"manual",document_type:"Other"}).select("id,updated_at").single();
 if(r.error)throw Error("Disposable document failed: "+r.error.code);return r.data;
}
async function api(f,path,body){const response=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{...(f?{Authorization:`Bearer ${f.token}`}:{}),"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});return {status:response.status,data:await response.json()};}
const draft={fields:{supplier:"Synthetic installer",scope:"Install supplied dishwasher",partsLabour:"",price:"CAD 800 + tax",taxes:"",exclusions:"",schedule:"",payment:"",warranty:""},answers:{taxes:"Asked for an inclusive total; waiting for reply."},decision:"questions",decisionNote:"QA fixture, not a customer quote",context:"tenant",reviewed:true,itemId:null,issueId:null,invoiceId:null};
try{
 const a=await account(),b=await account(),original=await doc(a),foreign=await doc(b),invoice=await doc(a,"Synthetic final invoice");
 const path="/api/mobile/v1/quotes?id="+original.id;
 check("unauthenticated denied",(await api(null,path)).status===401);
 let r=await api(a,path);check("saved quote opens with its source and empty review",r.status===200&&r.data.review===null&&r.data.document.notes.includes("CAD 800"));
 check("foreign household cannot read quote",(await api(b,path)).status===404);
 const initial={documentId:original.id,homeId:a.home,sourceVersion:r.data.document.updated_at,version:0,requestId:randomUUID(),action:"save",payload:draft};
 check("review required before planning to proceed",(await api(a,"/api/mobile/v1/quotes",{...initial,payload:{...draft,reviewed:false,decision:"proceed"}})).status===400);
 check("read requires consent before any model allowance",(await api(a,"/api/mobile/v1/quotes",{...initial,action:"read",payload:undefined})).status===400);
 check("foreign source cannot be saved",(await api(b,"/api/mobile/v1/quotes",{...initial,homeId:b.home})).status===404);
 check("wrong home rejected",(await api(a,"/api/mobile/v1/quotes",{...initial,homeId:b.home})).status===409);
 check("foreign linked invoice rejected",(await api(a,"/api/mobile/v1/quotes",{...initial,payload:{...draft,invoiceId:foreign.id}})).status===404);
 r=await api(a,"/api/mobile/v1/quotes",initial);check("review and answers saved",r.status===200&&r.data.review.revision===1&&r.data.review.payload.answers.taxes===draft.answers.taxes);
 check("private retry payload omitted",!Object.hasOwn(r.data.review,"last_payload"));
 const replay=await api(a,"/api/mobile/v1/quotes",initial);check("same request replays without duplicate",replay.status===200&&replay.data.replayed&&replay.data.review.revision===1);
 check("altered retry refused",(await api(a,"/api/mobile/v1/quotes",{...initial,payload:{...draft,decisionNote:"Changed"}})).status===409);
 const current=(await api(a,path)).data;check("fresh request resumes saved answers",current.review.payload.decision==="questions"&&current.review.payload.context==="tenant");
 const make=(version,payload=draft)=>({...initial,requestId:randomUUID(),version,payload});
 const pair=await Promise.all([api(a,"/api/mobile/v1/quotes",make(1)),api(a,"/api/mobile/v1/quotes",make(1))]);
 check("two-device edits produce one success and one conflict",pair.filter(x=>x.status===200).length===1&&pair.filter(x=>x.status===409).length===1);
 r=await api(a,"/api/mobile/v1/quotes",make(2,{...draft,invoiceId:invoice.id,decision:"proceed",decisionNote:"Record only; no agreement sent"}));check("invoice linked with recorded decision",r.status===200&&r.data.review.invoice_id===invoice.id&&r.data.review.payload.decision==="proceed");
 check("quote appears in saved review list",(await api(a,"/api/mobile/v1/quotes")).data.reviews.some(x=>x.documentId===original.id));
 const foreignRows=await b.client.from("quote_reviews").select("document_id").eq("document_id",original.id);
 check("hosted RLS hides private review",!foreignRows.error&&foreignRows.data.length===0);
 const direct=await a.client.from("quote_reviews").update({revision:99}).eq("document_id",original.id);
 check("direct writes denied",!!direct.error);
 const update=await a.client.from("documents").update({notes:"Revised proposed work. CAD 900 plus tax."}).eq("id",original.id);if(update.error)throw Error("Fixture original correction failed");
 r=await api(a,path);check("original correction invalidates review",r.status===200&&r.data.sourceChanged);
 check("old-source save rejected",(await api(a,"/api/mobile/v1/quotes",make(3))).status===409);
 const sourceVersion=r.data.document.updated_at;
 r=await api(a,"/api/mobile/v1/quotes",{...make(3),sourceVersion,payload:{...draft,fields:{...draft.fields,price:"CAD 900 + tax"}}});check("corrected source can be reviewed and saved",r.status===200&&r.data.review.revision===4);
 check("source freshness resets only after reviewed save",(await api(a,path)).data.sourceChanged===false);
 // Exercise the hosted worker protocol with fixtures; do not invoke a paid model.
 const readId=randomUUID();
 const claim=await a.client.rpc("change_rezlee_quote",{p_document:original.id,p_home:a.home,p_source:sourceVersion,p_version:4,p_request:readId,p_action:"read",p_payload:null});
 check("durable read claim saved",!claim.error&&claim.data.review.read_status==="reading");
 const claimReplay=await a.client.rpc("change_rezlee_quote",{p_document:original.id,p_home:a.home,p_source:sourceVersion,p_version:4,p_request:readId,p_action:"read",p_payload:null});
 check("durable read replay does not claim twice",!claimReplay.error&&claimReplay.data.replayed);
 const badFinish=await b.client.rpc("finish_rezlee_quote",{p_document:original.id,p_request:readId,p_result:[]});
 check("foreign account cannot complete worker",!badFinish.error&&badFinish.data===false);
 const facts=[{key:"price",value:"Subtotal CAD 1000.\nTotal CAD 900.",excerpt:"Page 1: Subtotal CAD 1000.\nPage 2: Total CAD 900.",page:null,citations:[{excerpt:"Subtotal CAD 1000.",page:1},{excerpt:"Total CAD 900.",page:2}]}];
 const finish=await a.client.rpc("finish_rezlee_quote",{p_document:original.id,p_request:readId,p_result:facts});
 check("worker result persists for return visit",!finish.error&&finish.data===true&&(await api(a,path)).data.review.read_result[0].excerpt===facts[0].excerpt&&(await api(a,path)).data.review.read_result[0].citations?.length===facts[0].citations.length&&(await api(a,path)).data.review.read_result[0].citations.every((c,i)=>c.page===facts[0].citations[i].page&&c.excerpt===facts[0].citations[i].excerpt));
 const readAgain=randomUUID();await a.client.rpc("change_rezlee_quote",{p_document:original.id,p_home:a.home,p_source:sourceVersion,p_version:6,p_request:readAgain,p_action:"read",p_payload:null});
 r=await api(a,"/api/mobile/v1/quotes",{...make(7),sourceVersion,action:"cancel",payload:undefined});check("cancelled read returns to manual review",r.status===200&&r.data.review.read_status==="idle");
 const late=await a.client.rpc("finish_rezlee_quote",{p_document:original.id,p_request:readAgain,p_result:facts});
 check("late worker cannot overwrite cancellation",!late.error&&late.data===false);
 const del=await a.client.from("documents").delete().eq("id",invoice.id);if(del.error)throw Error("Fixture invoice deletion failed");
 check("deleted invoice is unlinked",(await api(a,path)).data.review.invoice_id===null);
 const sourceDelete=await a.client.from("documents").delete().eq("id",original.id);if(sourceDelete.error)throw Error("Fixture quote deletion failed");
 check("source deletion removes review",(await api(a,path)).status===404&&(await a.client.from("quote_reviews").select("document_id").eq("document_id",original.id)).data.length===0);
}catch(error){failure=error instanceof Error?error.message:"QA failed";console.error("FAIL",failure);}
finally{
 for(const f of fixtures){const removed=await admin.auth.admin.deleteUser(f.id);if(removed.error)failure="Disposable account cleanup failed";}
 const rows=await admin.from("quote_reviews").select("document_id").in("user_id",fixtures.map(f=>f.id));
 if(rows.error||rows.data.length)failure="Disposable quote cleanup not confirmed";
 writeFileSync("docs/checkpoints/quote-files-live-20261011/staging-results.json",JSON.stringify({checks,passed:checks.length,failure,fixturesCleaned:!failure,paidAiCalls:0,paidProviderCalls:0,outgoingMessages:0},null,2));
}
if(failure)throw Error(failure);console.log("PASS "+checks.length+" authenticated staging quote checks; disposable fixtures cleaned.");

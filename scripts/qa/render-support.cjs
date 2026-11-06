const fs=require("node:fs"),assert=require("node:assert/strict"),esbuild=require("esbuild");
const {chromium}=require("/tmp/rezlee-bill-qa-tools-20261008/node_modules/playwright-core");
const root=process.cwd(),out=root+"/docs/qa/commercial-20261016",deps="/tmp/rezlee-bill-qa-tools-20261008/node_modules";
(async()=>{
fs.mkdirSync(out,{recursive:true});
await esbuild.build({stdin:{contents:'import React from"react";import{createRoot}from"react-dom/client";import{SupportWorkspace}from"'+root+'/src/app/admin/support/workspace.tsx";createRoot(document.getElementById("root")).render(<SupportWorkspace/>);',resolveDir:root,loader:"tsx"},outfile:out+"/support.js",bundle:true,format:"iife",platform:"browser",jsx:"automatic",alias:{react:deps+"/react","react-dom":deps+"/react-dom"},define:{"process.env.NODE_ENV":'"development"'},plugins:[{name:"next-boundary",setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:"link",namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:'import React from"react";export default function Link(p){return <a {...p}/>}',loader:"tsx",resolveDir:root}));}}]});
const cssRoot="/tmp/rezlee-commercial-staging-20261016/.next/static/chunks",css=fs.readdirSync(cssRoot).filter(x=>x.endsWith(".css")).map(x=>fs.readFileSync(cssRoot+"/"+x,"utf8")).join("\n");
const server=require("node:http").createServer((req,res)=>{if(req.url==="/support.js"){res.setHeader("content-type","application/javascript");return res.end(fs.readFileSync(out+"/support.js"));}if(req.url==="/style.css"){res.setHeader("content-type","text/css");return res.end(css);}res.setHeader("content-type","text/html");res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/support.js"></script>');});await new Promise(r=>server.listen(0,"127.0.0.1",r));
const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}),checks=[];
try{for(const width of [390,1200]){
const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(7000);const errors=[];page.on("pageerror",e=>errors.push(e.message));
await page.addInitScript(()=>{
window.__actions=[];window.__snapshot={owner:true,casesMore:false,controlsEnabled:true,generatedAt:"2026-10-16T03:00:00.000Z",vendors:[],cases:[{id:"case-a",customer_id:"user-a",subject:"Bill history needs review",note:"Customer sees only one of two statements",status:"open",revision:1,updated_at:"2026-10-16T02:00:00Z"}],providers:[{id:"provider-a",name:"Example utility",service:"Electricity",website:"https://example.invalid/account",paused:false,evidence:"configured",evidenceReference:"",verifiedAt:null,revision:1,configured:true}]};
window.fetch=async(_,init)=>{if(init?.body){const b=JSON.parse(init.body);window.__actions.push(b);
if(b.action==="customer")return Response.json({customer:{id:"user-a",verified:true,membership:{plan:"pro",source:"founder"}},providers:[{id:"provider-a",name:"Example utility",connection_status:"connected",sync_status:"partial",last_synced_at:null,savedBills:1,originalReferences:1}],runs:[{id:"run-a",provider_id:"provider-a",status:"completed",stage:"check_saved_bills",created_at:"2026-10-16T02:00:00Z"}],cases:[],billsTruncated:false});
if(b.action==="provider_update"){window.__snapshot.providers[0].paused=b.paused;window.__snapshot.providers[0].revision++;}
if(b.action==="vendor_update")window.__snapshot.vendors=[{vendor:b.vendor,status:b.status,plan:b.plan,limit_notes:b.limitNotes,review_before:b.reviewBefore,revision:2}];
return Response.json({result:{}});}return Response.json(structuredClone(window.__snapshot));};
});
await page.goto("http://127.0.0.1:"+server.address().port);
await page.getByRole("heading",{name:"Find a customer",exact:true}).waitFor();
await page.getByLabel("Exact email or customer reference").fill("example@example.invalid");await page.getByRole("button",{name:"Find customer",exact:true}).click();await page.getByText("1 saved bills · 1 original references",{exact:true}).waitFor();await page.getByText("Recent connection activity",{exact:true}).click();await page.getByText(/completed job is not proof/).waitFor();
await page.getByRole("button",{name:"Providers",exact:true}).click();assert.equal(await page.getByRole("button",{name:"Pause connection",exact:true}).isDisabled(),true);
await page.getByLabel("Reason for the next change").fill("Investigating a confirmed provider outage");await page.getByRole("button",{name:"Pause connection",exact:true}).click();await page.getByRole("button",{name:"Resume connection",exact:true}).waitFor();
assert.equal(await page.getByRole("button",{name:"Record live evidence",exact:true}).isDisabled(),true);
await page.screenshot({path:out+"/support-providers-"+width+".png",fullPage:true});
await page.getByRole("button",{name:"Capacity",exact:true}).click();await page.getByText("Update review",{exact:true}).first().click();await page.getByRole("combobox").first().selectOption("ready");
assert.equal(await page.getByRole("button",{name:"Save and assign to me",exact:true}).first().isDisabled(),true);
await page.getByLabel("Verified production plan",{exact:true}).first().fill("Verified Pro account");
await page.getByLabel("Limits, evidence and required action",{exact:true}).first().fill("Production dashboard checked. Plan and compute quota recorded; assigned owner reviews costs weekly.");
await page.getByLabel("Review again by (within 90 days)",{exact:true}).first().fill("2026-10-23");
await page.getByLabel("Reason for the next change").fill("Recorded verified capacity evidence from the production dashboard");await page.getByRole("button",{name:"Save and assign to me",exact:true}).first().click();await page.getByText("Verified Pro account",{exact:true}).waitFor();
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);assert.deepEqual(errors,[]);
await page.screenshot({path:out+"/support-capacity-"+width+".png",fullPage:true});checks.push({width,customerTimeline:true,pausedOnlyWithReason:true,evidenceRequired:true,vendorEvidenceAndOwnership:true});await page.close();
}fs.writeFileSync(out+"/support-results.json",JSON.stringify({checks,scope:"Actual support component and compiled CSS with mocked authenticated API; authorization checked separately."},null,2));console.log(JSON.stringify({passed:checks.length,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});

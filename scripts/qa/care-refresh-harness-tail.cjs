// API and device boundaries are fixtures; screen components and event handlers are real.
delete stubs['@/lib/care-data'];
stubs['@/lib/care-save']=`export const acknowledgeCareSave=async()=>{};export const submitCareSave=async()=>{};export const submitCareReminder=async body=>{window.__writes.push(body);return{requestId:'reminder'}};export const pendingCareReminder=async()=>null;export const resetRemovedCareReminder=async()=>{};`;
stubs['expo-crypto']=`export const randomUUID=()=>crypto.randomUUID();`;
stubs['@/lib/custom-cleaning']=`export const fetchCleaningRoutines=async()=>structuredClone(window.__routines);export const readRoutineDraft=async()=>window.__draft||null;export const readPendingRoutine=async()=>window.__pending||null;export const storeRoutineDraft=async(_,draft)=>{window.__draft=structuredClone(draft)};export const clearRoutineDraft=async()=>{window.__draft=null};export const recoverRoutineSave=async()=>null;export const saveCustomRoutine=async(homeId,draft)=>{window.__writes.push({homeId,draft});if(window.__saveError)throw Error('The connection dropped. Your choices are kept.');};export const addCarePerson=async(homeId,id,displayName)=>{const member={id,display_name:displayName,status:'local',linked_user_id:null};window.__peopleWrites.push({homeId,id,displayName});return{member}};`;
stubs['@/lib/api']=`export class ApiError extends Error{};export const apiGet=async()=>structuredClone(window.__care);export const apiPost=async(url,body)=>{window.__writes.push({url,body});return{nextDate:null}};export const apiDelete=async()=>{throw Error('Unexpected deletion')};`;
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 for(const [name,file]of Object.entries({routine:'care/custom-routine',routines:'care/routines',care:'(tabs)/care',reminder:'care/add'})){
  await esbuild.build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import App from'${root}/apps/mobile/app/${file}.tsx';createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:root,loader:'tsx'},outfile:out+'/'+name+'.js',bundle:true,platform:'browser',format:'iife',jsx:'automatic',loader:{'.png':'dataurl'},alias:{react:deps+'/react','react-dom':deps+'/react-dom','react-native-web':deps+'/react-native-web'},define:{global:'globalThis','process.env.NODE_ENV':'"development"'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>{if(stubs[a.path])return{path:a.path,namespace:'stub'};if(a.path.startsWith('@/')){const p=root+'/apps/mobile/src/'+a.path.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return{path:p+ext}}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));}}]});
 }
 const server=require('node:http').createServer((req,res)=>{const name=path.basename(req.url);if(name.endsWith('.js')){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(out+'/'+name));return;}res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui;background:#F7F6F2}*{box-sizing:border-box}#root{height:100dvh;display:flex;flex-direction:column}</style><div id="root"></div><script src="/'+name+'.js"></script>')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
 try{
 for(const viewport of [{width:390,height:844,scale:1},{width:320,height:700,scale:1},{width:390,height:844,scale:1.6}])for(const scenario of ['new','six','local','pending','member','paused','reminder']){
  const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}}),errors=[];
  page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
  await page.addInitScript(({scenario,scale})=>{
   window.__scale=scale;window.__routes=[];window.__writes=[];window.__peopleWrites=[];window.__params={};window.__draft=null;window.__pending=null;
   window.__household={available:true,accessRole:'owner',home:{id:'home-a',nickname:'Our place'},members:['Raza','Sumbul','Alex','Sam','Taylor','Jamie'].map((display_name,i)=>({id:'person-'+i,display_name,status:'active',linked_user_id:'user-'+i}))};
   window.__routines={homeId:'home-a',role:'owner',managedPeopleAvailable:true,routines:[]};
   const tasks=Array.from({length:12},(_,i)=>({key:'task-key-'+i,title:['Wipe counters','Wash dishes','Clean sink','Check fridge','Clean toilet','Clean shower','Fresh towels','Vacuum floors','Tidy toys','Change sheets','Fold clothes','Empty bins'][i],room:'Kitchen',start:'2026-10-20',unit:'week',every:1,weekdays:[2],members:[],rotation:'fixed'}));
   if(scenario==='six')window.__draft={id:'routine-a',version:0,applyCurrent:false,values:{title:'Our routine',timezone:'America/Toronto',state:'active',tasks}};
   if(scenario==='pending'){window.__pending={id:'routine-a',version:0,applyCurrent:false,values:{title:'Our routine',timezone:'America/Toronto',state:'active',tasks:[tasks[0]]}};window.__saveError=true;}
   if(scenario==='paused')window.__routines.routines=[{id:'routine-a',title:'Weekend reset',timezone:'America/Toronto',state:'paused',version:1,definition:tasks.slice(0,3)}];
   window.__care={accessRole:scenario==='member'?'member':'owner',adoption:{cleaning:true},tasks:tasks.slice(0,6).map((t,i)=>({id:t.key,title:t.title,category:t.room,due_date:t.start,recurrence:'custom',status:'open',displayStatus:'upcoming',assignedMemberId:'person-'+i,assigneeName:window.__household.members[i].display_name,canComplete:i===1,cleaningRoutineId:'routine-a'}))};
  },{scenario,scale:viewport.scale});
  const screen=scenario==='member'?'care':scenario==='paused'?'routines':scenario==='reminder'?'reminder':'routine';
  await page.goto('http://127.0.0.1:'+server.address().port+'/'+screen);
  const button=name=>page.getByRole('button',{name,exact:true}),field=name=>page.getByRole('textbox',{name,exact:true});
  async function capture(name){
   if(viewport.scale>1)await page.evaluate(scale=>{for(const el of document.querySelectorAll('[dir="auto"],textarea,input'))if(!el.dataset.scaled){const s=getComputedStyle(el);el.style.fontSize=parseFloat(s.fontSize)*scale+'px';if(s.lineHeight!=='normal')el.style.lineHeight=parseFloat(s.lineHeight)*scale+'px';el.dataset.scaled='1';}},viewport.scale);
   await page.evaluate(()=>{for(const el of document.querySelectorAll('*'))if(el.scrollTop)el.scrollTop=0});
   assert.deepEqual(errors,[],name);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow');
   await page.screenshot({path:out+'/'+name+'-'+viewport.width+'-'+viewport.scale+'.png'});
  }
  if(scenario==='new'||scenario==='local'){
   await page.getByRole('checkbox',{name:'Wipe kitchen counters',exact:true}).waitFor();await capture('choose-jobs');
   await page.getByRole('checkbox',{name:'Wipe kitchen counters',exact:true}).click();await button('Share this job').click();
   if(scenario==='local'){await button('Add someone whose tasks you manage').click();await field('First name or nickname').fill('Mina');await button('Add to household').click();await page.waitForFunction(()=>window.__peopleWrites.length===1);await button('Mina, managed by you').last().click();assert.equal(await page.evaluate(()=>window.__peopleWrites[0].displayName),'Mina');}
   else{await button('Raza').first().click();await button('Sumbul').first().click();await button('Take turns each week').click();assert.deepEqual(await page.evaluate(()=>window.__draft.values.tasks[0].members),['person-0','person-1']);}
   await capture(scenario==='local'?'managed-person':'share-jobs');await button('Review the routine').click();await capture('review-'+scenario);await button('Start our routine').click();await page.waitForFunction(()=>window.__writes.length===1);assert.equal(await page.evaluate(()=>window.__routes.at(-1).pathname),'/care/routines');
  }else if(scenario==='six'){
   await button('Share the jobs').click();for(const name of ['Raza','Sumbul','Alex','Sam','Taylor','Jamie'])await button(name).first().click();await button('Spread jobs across these people').click();
   assert.deepEqual(await page.evaluate(()=>window.__draft.values.tasks.map(t=>t.members[0])),Array.from({length:12},(_,i)=>'person-'+i%6));await capture('six-people');
   await button('Take turns each week').click();assert.deepEqual(await page.evaluate(()=>window.__draft.values.tasks.slice(0,6).map(t=>t.members[0])),Array.from({length:6},(_,i)=>'person-'+i));await button('Review the routine').click();await button('Start our routine').click();await page.waitForFunction(()=>window.__writes.length===1);
  }else if(scenario==='pending'){
   await button('Check saved routine').waitFor();assert.equal(await button('Start our routine').isDisabled(),true);await button('Retry the same save').click();await page.waitForFunction(()=>window.__writes.length===1);await page.getByText('The connection dropped. Your choices are kept.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__routes.length),0);await capture('pending-save');
  }else if(scenario==='member'){
   await page.getByText('Your household’s to-dos',{exact:true}).waitFor();await capture('care-member');assert.equal(await button('Remember something').count(),0);assert.equal(await button('Mark Wipe counters complete').count(),0);
   await button('Sumbul').click();assert.equal(await button('Wash dishes. View task').count(),1);assert.equal(await button('Wipe counters. View task').count(),0);await button('Mark Wash dishes complete').click();await page.waitForFunction(()=>window.__writes.length===1);
  }else if(scenario==='paused'){
   await button('Resume routine').waitFor();await capture('paused-routine');await button('Resume routine').click();await page.waitForFunction(()=>window.__writes.length===1);assert.equal(await page.evaluate(()=>window.__writes[0].draft.values.state),'active');
  }else if(scenario==='reminder'){
   await button('Put the bins out').click();assert.equal(await field('Task').inputValue(),'Put the bins out');await capture('reminder');await button('Save reminder').click();await page.waitForFunction(()=>window.__writes.length===1);
  }
  assert.deepEqual(errors,[],scenario);checks.push({scenario,...viewport,pass:true});await page.close();
 }
 fs.writeFileSync(out+'/results.json',JSON.stringify({passed:checks.length,checks,boundaries:'Actual React Native screens and handlers rendered with RN Web. API/auth/storage/router are fixtures; no live customer data or messages. Native phone acceptance remains.'},null,2));console.log(JSON.stringify({passed:checks.length,out}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

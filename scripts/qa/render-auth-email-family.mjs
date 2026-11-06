import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {welcomePayload} from '../../src/lib/email/welcome.ts';
const require=createRequire(import.meta.url),{chromium}=require('/tmp/rezlee-bill-qa-tools-20261008/node_modules/playwright-core');
const out=process.cwd()+'/docs/qa/customer-communications-20261012/emails';fs.mkdirSync(out,{recursive:true});
const templates=[...JSON.parse(fs.readFileSync('supabase/templates/family.json','utf8')).map(row=>({slug:row.slug,html:fs.readFileSync(row.file,'utf8')})),{slug:'welcome',html:welcomePayload('Rezlee <hello@rezlee.com>','fixture@example.invalid','https://staging.rezlee.com').html}];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),checks=[];
try{
 for(const template of templates){
  const html=template.html.replaceAll('{{ .SiteURL }}','https://staging.rezlee.com').replaceAll('{{ .ConfirmationURL }}','https://staging.rezlee.com/auth/callback').replaceAll('{{ .Token }}','87654321');fs.writeFileSync(path.join(out,template.slug+'.html'),html);
  for(const width of [320,390]){
   const page=await browser.newPage({viewport:{width,height:900}});await page.setContent(html);
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Email overflow '+template.slug);
   if(await page.locator('h1').count()!==1)throw Error('Missing email heading '+template.slug);
   const links=await page.locator('a').evaluateAll(nodes=>nodes.map(a=>a.href));if(links.some(link=>!link.startsWith('https://staging.rezlee.com/')))throw Error('Unexpected email destination');
   if(['welcome','password-changed','magic-link-or-otp'].includes(template.slug))await page.screenshot({path:path.join(out,template.slug+'-'+width+'.png'),fullPage:true});
   checks.push({template:template.slug,width,pass:true});await page.close();
  }
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:checks.length,checks,boundaries:'HTML and links at phone widths; email-client rendering, delivery and native handoff require real acceptance.'},null,2));
 console.log(JSON.stringify({passed:checks.length}));
}finally{await browser.close()}

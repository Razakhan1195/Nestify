// Synthetic, non-customer fixtures. No provider access, AI, or tariff claims.
import {createHash} from 'node:crypto';
export const demoKey='rezlee-marketing-home-2026-09-v1';
export const stableId=label=>{const h=createHash('sha256').update(demoKey+':'+label).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const money=c=>(c/100).toFixed(2);
const line=(label,kind,minor,extra={})=>({label,kind,amount:money(minor),quantity:'',unit:'',rate:'',rateUnit:'',band:'',quote:`${label}: CAD ${money(minor)} (sample)`,...extra});
const electric=[610,540,640,780,860,800,690,570,620,790,980,890];
const gas=[44,95,185,295,360,325,250,160,82,49,38,42];
export function demoStatements(){
 const result=[];
 for(let i=0;i<12;i++){
  const start=new Date(Date.UTC(2025,8+i,1)),end=new Date(Date.UTC(2025,9+i,0));
  const periodStart=start.toISOString().slice(0,10),periodEnd=end.toISOString().slice(0,10);
  const issue=new Date(end.getTime()+86400000).toISOString().slice(0,10);
  for(const service of ['electricity','gas','internet']){
   let lines=[],subtotal=0,credits=0,usage='',unit='',reading='',ratePlan='',discountEnds='';
   if(service==='electricity'){
    usage=String(electric[i]);unit='kWh';reading='actual';ratePlan='TOU - illustrative sample rates';
    const off=Math.round(electric[i]*.65),mid=Math.round(electric[i]*.18),on=electric[i]-off-mid;
    lines=[line('Off-peak electricity','energy',off*10,{quantity:String(off),unit,rate:'10',rateUnit:'cents/kWh',band:'off_peak'}),line('Mid-peak electricity','energy',mid*15,{quantity:String(mid),unit,rate:'15',rateUnit:'cents/kWh',band:'mid_peak'}),line('On-peak electricity','energy',on*20,{quantity:String(on),unit,rate:'20',rateUnit:'cents/kWh',band:'on_peak'}),line('Delivery','delivery',4300),line('Regulatory charges','regulatory',Math.round(electric[i]*.5))];
    subtotal=lines.reduce((n,l)=>n+Math.round(Number(l.amount)*100),0);
   }else if(service==='gas'){
    usage=String(gas[i]);unit='m³';reading='actual';ratePlan='Residential gas - sample';
    const rate=i===11?27:25;
    lines=[line('Gas supply','energy',gas[i]*rate,{quantity:usage,unit,rate:String(rate),rateUnit:'cents/m³'}),line('Delivery','delivery',gas[i]*14),line('Customer charge','fixed',2300)];
    subtotal=lines.reduce((n,l)=>n+Math.round(Number(l.amount)*100),0);
   }else{subtotal=9000;credits=i<11?2000:0;discountEnds='2026-07-31';ratePlan='Home internet - sample';}
   const tax=Math.round((subtotal-credits)*13/100),total=subtotal+tax-credits;
   if(service!=='internet')lines.push(line('HST','tax',tax));
   const provider={electricity:'Elexicon Energy',gas:'Enbridge Gas',internet:'Rogers'}[service];
   const account={electricity:'Demo account 1001',gas:'Demo account 2001',internet:'Demo account 3001'}[service];
   const fields={previousBalance:'0.00',amountDue:money(total),subtotal:money(subtotal),tax:money(tax),credits:money(credits),usage,unit,reading,ratePlan,discountEnds};
   const notes='DEMO / SAMPLE DATA. Fictional household and illustrative charges; not a provider-issued statement or verified tariff. No payment, connection or savings claim.';
   result.push({key:service+'-'+periodStart,service,provider,account,periodStart,periodEnd,issue,amount:money(total),notes,
    supporting:{fields,quotes:{subtotal:`Subtotal before tax and credits: CAD ${money(subtotal)}`,tax:`HST: CAD ${money(tax)}`,credits:`Discounts and credits: CAD ${money(credits)}`,...(discountEnds?{discountEnds:'Sample promotion ended July 31, 2026'}:{})},...(lines.length?{energy:{version:1,service,scope:'single_service',lines}}:{})}});
  }
 }
 return result;
}
// Small valid vector PDF; exact source values, embedded text, no raster screenshot.
export function statementPdf(s){
 const cmds=[],safe=t=>String(t).replace(/m³/g,'m3').replace(/[^\x20-\x7E]/g,'-').replace(/[\\()]/g,'\\$&');
 const text=(x,y,size,t,bold=false,color='0.12 0.20 0.17')=>cmds.push(`${color} rg BT /${bold?'F2':'F1'} ${size} Tf ${x} ${y} Td (${safe(t)}) Tj ET`);
 cmds.push('0.95 0.96 0.94 rg 0 692 612 100 re f');
 text(44,750,12,'REZLEE / DEMO HOME',true);text(44,720,24,'Sample statement',true);
 text(44,670,18,s.provider,true);text(44,650,10,'Illustrative account. Not issued by or affiliated with the provider.');
 text(44,623,11,s.account);text(44,601,11,`Service period: ${s.periodStart} to ${s.periodEnd}`);text(44,581,11,`Issue date: ${s.issue}  |  Currency: CAD`);
 text(44,549,11,s.supporting.fields.ratePlan,true);
 let y=520;
 if(s.supporting.energy){
  for(const l of s.supporting.energy.lines){
   text(44,y,11,l.label);text(470,y,11,'$'+l.amount,true);y-=18;
   if(l.quantity){text(54,y,9,`${l.quantity} ${l.unit} x ${l.rate} ${l.rateUnit} (illustrative rate)`);y-=22;}
  }
  text(44,y-4,10,`Total usage: ${s.supporting.fields.usage} ${s.supporting.fields.unit} | Sample actual reading`);y-=32;
 }else{ text(44,y,11,'Home internet service');text(470,y,11,'$90.00',true);y-=22;text(44,y,10,'Sample promotion ended July 31, 2026.');y-=30;}
 y=Math.min(y,345);cmds.push(`0.80 0.85 0.81 RG 44 ${y+15} m 568 ${y+15} l S`);
 for(const [label,value] of [['Subtotal before tax and credits',s.supporting.fields.subtotal],['HST',s.supporting.fields.tax],['Discounts and credits',s.supporting.fields.credits],['Current-period charges',s.amount],['Previous balance',s.supporting.fields.previousBalance],['Amount due when issued',s.supporting.fields.amountDue]]){text(44,y,11,label);text(470,y,11,'$'+value,true);y-=22;}
 text(44,126,10,'Payment status: not recorded. Amount due does not prove payment.');
 text(44,96,10,'SAMPLE DATA - for product demonstration only.',true);
 text(44,78,9,'Charges and usage are simulated; no live connection or provider retrieval occurred.');
 text(44,61,9,'Rates are illustrative, not current tariff advice. No annual savings are claimed.');
 const stream=cmds.join('\n');
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});
 const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 7\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(pdf);
}

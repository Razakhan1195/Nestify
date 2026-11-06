import {analyzeManualHistory,manualHistoryAccounts,type HistoryBill} from "./manual-history-insights";
import {explainStatementChange} from "./statement-change";

export function homeBillAccounts(bills:HistoryBill[],complete:boolean,today:string){
 return manualHistoryAccounts(bills).map(account=>{
  const analysis=analyzeManualHistory(account,{complete,today});
  const paired=explainStatementChange(analysis),ready=analysis.comparison!==null;
  const onlyShortHistory=analysis.issues.length===1&&analysis.issues[0]==="history";
  const canUnderstand=onlyShortHistory&&account.bills.length===1;
  const billId=account.bills[0].id,count=account.bills.length;
  let finding:string,action:string;
  if(ready){
   const percent=Math.round(Math.abs(analysis.comparison!.percent));
   finding=percent===0?"Daily charges are about the same":percent+"% "+(analysis.comparison!.percent>0?"higher":"lower")+" daily charges than earlier saved periods";
   action="Compare charges";
  }else if(paired){finding="Two periods available to review what changed";action="Review what changed";}
  else if(canUnderstand){finding="Understand the charges on this bill";action="Understand this bill";}
  else{
   const reasons={identity:"Check the account details",coverage:"Full history could not be confirmed",dates:"Check the billing periods",ongoing:"Service period still in progress",amount:"Check the recorded charges",overlap:"Some billing periods overlap",credit:"History includes a credit",history:"Review your saved statements",zero_baseline:"Earlier periods total zero"};
   finding=reasons[analysis.issues[0]]??"Review your saved statements";action="Review statements";
  }
  return {key:account.key,provider:account.provider,nickname:account.nickname,category:account.category,count,billId,finding,action,
   destination:canUnderstand?(account.currency==="CAD"?"review":"bill"):"history",
   latestEnd:analysis.latest?.end??null,stale:(analysis.daysSinceLatest??0)>62,gaps:analysis.gapDays>0,ready};
 }).sort((a,b)=>a.provider.localeCompare(b.provider)||a.category.localeCompare(b.category)||a.nickname.localeCompare(b.nickname)||a.key.localeCompare(b.key));
}

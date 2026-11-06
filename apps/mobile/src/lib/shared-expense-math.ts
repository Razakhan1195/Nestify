/** Currency input and splits are integer cents. No AI or floating-point currency arithmetic. */
export function parseCadCents(value: string): number | null {
 const text=value.trim();
 if(!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(text))return null;
 const [whole,fraction=""]=text.split(".");
 const cents=Number(whole)*100+Number(fraction.padEnd(2,"0"));
 return cents>=1&&cents<=100000000?cents:null;
}
export type ExpenseShare={personId:string;cents:number};
export function equalExpenseShares(cents:number,personIds:string[]):ExpenseShare[]{
 const ids=[...new Set(personIds)].sort();
 if(!Number.isSafeInteger(cents)||cents<1||!ids.length||ids.length>40||ids.length!==personIds.length)throw Error("Check the amount and people.");
 const base=Math.floor(cents/ids.length),remainder=cents%ids.length;
 return ids.map((personId,index)=>({personId,cents:base+(index<remainder?1:0)}));
}
export function centsInput(cents:number){return (cents/100).toFixed(2);}
export function sharedMoney(cents:number){return new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD"}).format(cents/100);}
export function sumShares(shares:ExpenseShare[]){return shares.reduce((sum,s)=>sum+s.cents,0);}

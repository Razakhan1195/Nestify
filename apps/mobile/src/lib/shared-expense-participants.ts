type Person={id:string;self:boolean;state:string};
export function initialExpenseParticipants(people:Person[]){
 return people.filter(p=>p.self&&p.state!=="former").map(p=>p.id);
}
export function hasSharedParticipants(people:Person[],selected:string[],payer:string){
 if(!selected.length||selected.length>40||new Set(selected).size!==selected.length)return false;
 const involved=[...new Set([...selected,payer])];
 return involved.length>=2&&involved.every(id=>people.some(p=>p.id===id));
}

/** Full selections remain in the people sheet; the compact summary scales to roommates. */
export function expenseParticipantSummary(people:(Person&{name:string})[],selected:string[]){
 const names=selected.map(id=>{const person=people.find(p=>p.id===id);return person?.self?"You":person?.name??"Former participant";});
 return names.length<=2?names.join(" & "):names.slice(0,2).join(", ")+" + "+(names.length-2)+" more";
}

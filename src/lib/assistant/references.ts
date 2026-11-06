export type AssistantReference = { id: string; label: string; href: string };
export function resolveAssistantReferences(text: string, available: AssistantReference[]) {
  const allowed=new Map(available.map(ref=>[ref.id,ref]));
  const selected=new Map<string,AssistantReference>();
  const reply=text.replace(/\[\[ref:([^\]]+)\]\]/g,(_,id:string)=>{
    const ref=allowed.get(id);
    if(ref) selected.set(id,ref);
    return "";
  }).replace(/[ \t]+\n/g,"\n").trim();
  return {reply,references:[...selected.values()].slice(0,4)};
}

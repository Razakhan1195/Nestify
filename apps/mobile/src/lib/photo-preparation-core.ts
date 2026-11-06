export type PhotoInput = {uri:string;name:string;type:string;size?:number;width?:number;height?:number};
export const PHOTO_PREPARATION_ERROR="Could not prepare this photo. Try another photo or export it as a JPG or PDF. Your existing details are still here.";
export const PHOTO_TARGET_BYTES=3_500_000;
export function photoResize(width:number,height:number,maxEdge:number){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Could not read this photo. Take another photo or choose a file.');
 const scale=Math.min(1,maxEdge/Math.max(width,height));
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
export async function preparePhoto(input:PhotoInput,transform:(input:PhotoInput,size:{width:number;height:number},quality:number)=>Promise<{uri:string;size:number}>):Promise<PhotoInput>{
 if(!input.type.startsWith('image/'))return input;
 const name=(input.name.replace(/\.[^.]+$/,'').slice(0,180)||'receipt')+'.jpg';
 for(const [edge,quality] of [[2800,.86],[2400,.78],[2000,.72]] as const){
  const dimensions=photoResize(input.width!,input.height!,edge);
  const result=await transform(input,dimensions,quality);
  if(Number.isFinite(result.size)&&result.size>0&&result.size<=PHOTO_TARGET_BYTES)return {...result,...dimensions,name,type:'image/jpeg'};
 }
 throw Error('This photo could not be prepared clearly. Retake it with just the document in view, or choose a saved file.');
}

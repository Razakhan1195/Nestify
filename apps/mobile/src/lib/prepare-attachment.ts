import {Image} from 'react-native';
import {ImageManipulator,SaveFormat} from 'expo-image-manipulator';
import {File} from 'expo-file-system';
import {preparePhoto,PHOTO_PREPARATION_ERROR,type PhotoInput} from './photo-preparation-core';
/** Resize and encode locally; no document is sent until the customer requests reading/saving. */
export async function prepareAttachment(input:PhotoInput):Promise<PhotoInput>{
 if(!input.type.startsWith('image/'))return input;
 try{
 if(!input.width||!input.height){
  const dimensions=await new Promise<{width:number;height:number}>((resolve,reject)=>Image.getSize(input.uri,(width,height)=>resolve({width,height}),reject));
  input={...input,...dimensions};
 }
 return await preparePhoto(input,async(source,dimensions,compress)=>{
  const context=ImageManipulator.manipulate(source.uri);
  try{
   context.resize(dimensions);
   const rendered=await context.renderAsync();
   try{
    const result=await rendered.saveAsync({format:SaveFormat.JPEG,compress});
    return {uri:result.uri,size:new File(result.uri).size};
   }finally{rendered.release();}
  }finally{context.release();}
 });
 }catch{throw new Error(PHOTO_PREPARATION_ERROR);}
}

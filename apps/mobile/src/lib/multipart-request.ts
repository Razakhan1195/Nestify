/** React Native URI FormData needs XMLHttpRequest: Expo's default fetch accepts Blob/File only.
 * Keep this boundary shared by all mobile uploads. Never set Content-Type manually;
 * React Native creates the multipart boundary. No automatic retries.
 */
export function multipartRequest(url: string, body: FormData, options: { headers: Record<string,string>; signal?: AbortSignal | null }): Promise<Response> {
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    const cleanup=()=>options.signal?.removeEventListener("abort",abort);
    const fail=(error:Error)=>{cleanup();reject(error);};
    const abort=()=>{xhr.abort();fail(new Error("Upload cancelled"));};
    if(options.signal?.aborted){reject(new Error("Upload cancelled"));return;}
    xhr.onload=()=>{
      cleanup();
      if(xhr.status===0){reject(new TypeError("Network request failed"));return;}
      // Match fetch's response contract; consumers inspect status before parsing JSON.
      resolve(new Response([204,205,304].includes(xhr.status)?null:xhr.responseText,{status:xhr.status}));
    };
    xhr.onerror=()=>fail(new TypeError("Network request failed"));
    xhr.ontimeout=()=>fail(new Error("Upload timed out"));
    xhr.onabort=()=>fail(new Error("Upload cancelled"));
    try{
      xhr.open("POST",url,true);
      Object.entries(options.headers).forEach(([name,value])=>xhr.setRequestHeader(name,value));
      options.signal?.addEventListener("abort",abort,{once:true});
      xhr.send(body);
    }catch(error){cleanup();reject(error);}
  });
}

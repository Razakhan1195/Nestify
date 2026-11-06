type Session={access_token:string;expires_at?:number;user:{id:string}};
type Auth={getSession:()=>Promise<{data:{session:Session|null}}>;
 refreshSession:()=>Promise<{data:{session:Session|null};error:unknown}>};
export class SessionTokenError extends Error {
 constructor(message:string,public status:number){super(message);}
}
/** One refresh for concurrent callers; never return a token for a changed account. */
export function createSessionTokenReader(auth:Auth,now=()=>Date.now()){
 let refresh:Promise<{data:{session:Session|null};error:unknown}>|null=null;
 return async(expectedUserId?:string,forceRefresh=false)=>{
  let session=(await auth.getSession()).data.session;
  if(expectedUserId&&session?.user.id!==expectedUserId)throw new SessionTokenError("Your account changed. Reopen this screen to continue.",409);
  if(!session?.access_token)throw new SessionTokenError("Please sign in again to continue. Your saved progress is kept.",401);
  const userId=session.user.id;
  if(forceRefresh||(session.expires_at!==undefined&&session.expires_at*1000<=now()+60000)){
   if(!refresh)refresh=auth.refreshSession().finally(()=>{refresh=null;});
   const result=await refresh;
   const current=(await auth.getSession()).data.session;
   if(current?.user.id!==userId)throw new SessionTokenError("Your account changed. Reopen this screen to continue.",409);
   if(result.error||!result.data.session)throw new SessionTokenError("Could not renew your session. Try again; your saved progress is kept.",503);
   if(result.data.session.user.id!==userId)throw new SessionTokenError("Your account changed. Reopen this screen to continue.",409);
   session=current;
   if(!session?.access_token||session.expires_at!==undefined&&session.expires_at*1000<=now())throw new SessionTokenError("Please sign in again to continue. Your saved progress is kept.",401);
  }
  return session.access_token;
 };
}

# Read-only metrics collector. Deliberately performs no SQL sampling during load.
from pathlib import Path
import json,urllib.request,base64,time,datetime,sys,re,os
p=Path(os.environ['REZLEE_QA_OUTPUT'])
p.mkdir(parents=True,exist_ok=True,mode=0o700)
label=sys.argv[1]
if not re.fullmatch('[a-z0-9-]{1,50}',label):raise SystemExit('Invalid label')
out=p/('capacity-'+label);out.mkdir(exist_ok=True)
e=json.loads(Path(os.environ['REZLEE_STAGING_QA_SETTINGS']).read_text())
if e['NEXT_PUBLIC_SUPABASE_URL']!='https://gjwvalpxnfbvryosmcbj.supabase.co':raise SystemExit('Staging only')
duration=int(sys.argv[2]) if len(sys.argv)>2 else 600
if not 60<=duration<=2400:raise SystemExit('Invalid duration')
end=time.monotonic()+duration;i=0
while time.monotonic()<end:
 at=datetime.datetime.now(datetime.timezone.utc).isoformat()
 for kind,url,headers,data in [
 ('metrics','https://gjwvalpxnfbvryosmcbj.supabase.co/customer/v1/privileged/metrics',{'Authorization':'Basic '+base64.b64encode(('service_role:'+e['SUPABASE_SECRET_KEY']).encode()).decode()},None),
 ]:
  try:
   req=urllib.request.Request(url,headers=headers,data=data)
   with urllib.request.urlopen(req,timeout=15) as res:body=res.read()
   f=out/(str(i)+'-'+kind+('.prom' if kind=='metrics' else '.json'));f.write_bytes(body);f.chmod(0o600)
  except Exception as err:print(at,kind,type(err).__name__,flush=True)
 (out/(str(i)+'-time.json')).write_text(json.dumps({'sampleStartedAt':at,'sampleFinishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}))
 print(at,'sample',i,'saved',flush=True);i+=1
 if (out/'stop').exists():break
 time.sleep(20)
print('COLLECTION_COMPLETE',flush=True)

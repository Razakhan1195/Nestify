from pathlib import Path
import subprocess,json,urllib.request,urllib.error,urllib.parse,zipfile,plistlib,os,hashlib,re
from datetime import datetime,timezone
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');o=r/'docs/checkpoints/native-candidate-20261021'
m=Path('/Users/razakhan/Library/Application Support/Rezlee/launch-candidate-20261021/mobile')
dest=m.parent/'artifacts';dest.mkdir(exist_ok=True)
jobs=json.loads((o/'build-submission.json').read_text())['builds']
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/e25a38a8cc65d08e/node_modules/eas-cli/bin/run']
results=[]
for job in jobs:
 p=subprocess.run(cli+['build:view',job['id'],'--json'],cwd=m,capture_output=True,text=True,timeout=60,check=True);data=json.loads(p.stdout)
 result={'id':data['id'],'platform':data['platform'],'build':data['appBuildVersion'],'status':data['status'],'installed':False,'testerDelivery':False}
 if data['status']!='FINISHED':results.append(result);continue
 assert data.get('gitCommitHash')=='510db2ff5d85a08e0d856e6fce8a79e9750c9d07'
 url=data['artifacts']['buildUrl'];assert url.startswith('https://')
 suffix='.ipa' if data['platform']=='IOS' else '.aab'
 target=dest/(data['platform'].lower()+'-'+data['appBuildVersion']+suffix)
 if not target.exists():
  tmp=target.with_suffix(suffix+'.partial');total=0
  request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 RezleeBuildVerification/1.0','Accept':'application/octet-stream'})
  try: response=urllib.request.urlopen(request,timeout=60)
  except urllib.error.HTTPError as error:
   result['artifactInspectionBlocked']={'httpStatus':error.code,'host':urllib.parse.urlparse(url).hostname}
   results.append(result);print(json.dumps(result),flush=True);continue
  with response,tmp.open('wb') as f:
   while True:
    chunk=response.read(1024*1024)
    if not chunk:break
    total+=len(chunk)
    if total>400*1024*1024:raise RuntimeError('Artifact exceeded expected limit')
    f.write(chunk)
  tmp.rename(target)
 digest=hashlib.file_digest(target.open('rb'),'sha256').hexdigest() if hasattr(hashlib,'file_digest') else hashlib.sha256(target.read_bytes()).hexdigest()
 checks={}
 with zipfile.ZipFile(target) as z:
  names=z.namelist()
  bundles=[n for n in names if n.endswith(('main.jsbundle','index.android.bundle'))]
  assert bundles,'Expected native JavaScript bundle missing'
  blob=b''.join(z.read(n) for n in bundles)
  configFiles=[n for n in names if n.endswith(('app.manifest','ExpoConstants.json','app.config.json'))]
  for n in configFiles:blob+=z.read(n)
  checks['stagingApiEmbedded']=b'https://staging.rezlee.com' in blob
  checks['stagingDatabaseEmbedded']=b'gjwvalpxnfbvryosmcbj.supabase.co' in blob
  checks['productionDatabaseEmbedded']=b'eynbuhmtxkigvqoewbwi.supabase.co' in blob
  for name in ['EXPO_PUBLIC_REVENUECAT_IOS_KEY','EXPO_PUBLIC_REVENUECAT_ANDROID_KEY']:
   value=os.environ.get(name,'');checks[name+'MatchesEas']=bool(value and value.encode() in blob)
  if data['platform']=='IOS':
   infoName=next(n for n in names if re.match(r'^Payload/[^/]+\.app/Info\.plist$',n))
   info=plistlib.loads(z.read(infoName));checks['nativeInfo']={k:info.get(k) for k in ['CFBundleIdentifier','CFBundleVersion','CFBundleShortVersionString','CFBundleDisplayName']}
  checks['bundlePaths']=bundles
  checks['embeddedConfigFiles']=configFiles
 result.update({'artifactFile':str(target),'bytes':target.stat().st_size,'sha256':digest,'embeddingChecks':checks,'scope':'Archive inspection only; actual launch/network behaviour and source-map error receipt remain unverified'})
 logCount=0;sentry=False;upload=False
 for log in data.get('logFiles',[])[:40]:
  link=log if isinstance(log,str) else log.get('url')
  if not link or not link.startswith('https://'):continue
  try:
   with urllib.request.urlopen(urllib.request.Request(link,headers={'User-Agent':'Mozilla/5.0 RezleeBuildVerification/1.0'}),timeout=20) as response:text=response.read(12*1024*1024).decode(errors='ignore').lower()
   logCount+=1;sentry=sentry or 'sentry' in text
   upload=upload or any(marker in text for marker in ['successfully uploaded source maps','successfully uploaded sourcemaps','source map upload report','file upload complete'])
  except Exception:pass
 result['sourceMapBuildEvidence']={'logsRead':logCount,'sentryMentioned':sentry,'uploadSuccessMarkerSeen':upload,'liveNativeErrorReceiptVerified':False}
 results.append(result)
 print(json.dumps({'platform':result['platform'],'build':result['build'],'status':result['status'],'artifactInspected':True,'embeddingChecks':checks,'sourceMapBuildEvidence':result['sourceMapBuildEvidence']}),flush=True)
report={'at':datetime.now(timezone.utc).isoformat(),'builds':results,'noStoreUpload':True,'noPhoneAcceptanceClaimed':True}
(o/'artifact-inspection.json').write_text(json.dumps(report,indent=2)+'\n');print('Artifact inspection checkpoint saved.',flush=True)

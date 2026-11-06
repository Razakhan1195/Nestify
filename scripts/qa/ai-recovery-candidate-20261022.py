
import pathlib,json,subprocess,base64,hashlib,time,datetime,os
r=pathlib.Path('/Users/razakhan/Documents/rezlee-mobile-test');out=r/'docs/checkpoints/launch-closeout-20261021'
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api'];team='team_RWL45V0YAuHJ7DvygUtJNB8o'
def api(p,b=None):
 c=cli+[p+('&' if '?' in p else '?')+'teamId='+team]
 if b is not None:c+=['--method','POST','--input','-']
 x=subprocess.run(c,input=json.dumps(b) if b is not None else None,capture_output=True,text=True,timeout=90)
 assert x.returncode==0,'Vercel operation failed; response suppressed'
 return json.loads(x.stdout)
state={'pid':os.getpid(),'stage':'preparing','productionChanged':False}
def save():
 state['at']=datetime.datetime.now(datetime.timezone.utc).isoformat();(out/'ai-recovery-candidate-status.json').write_text(json.dumps(state,indent=2));print(json.dumps(state),flush=True)
previous='dpl_73wZA23j8AXLXYzi9snksdTittwQ'
assert api('/v4/aliases/staging.rezlee.com')['deploymentId']==previous
prod=api('/v4/aliases/rezlee.com')['deploymentId']
payload=json.loads((r/'docs/checkpoints/release-config-20261021/release-deployment-source.json').read_text())
names=['src/app/api/mobile/v1/assistant/route.ts','src/lib/ai/allowance-result.ts','src/lib/ai/spend.ts']
data=b''.join((r/n).read_bytes() for n in names)
payload['files']=[x for x in payload['files'] if x['file'] not in names]+[{'file':n,'data':base64.b64encode((r/n).read_bytes()).decode(),'encoding':'base64'} for n in names]
payload['meta']={'rezleeCandidate':'AI-failed-answer-allowance-recovery','rezleeSource':'accepted-candidate-plus-three-reviewed-AI-files'}
assert not any(k in payload for k in ['env','target','deploymentId'])
state['overlaySha256']=hashlib.sha256(data).hexdigest()
d=api('/v13/deployments',payload);state.update(stage='building',deploymentId=d['id'],previousDeploymentId=previous);save()
for _ in range(45):
 v=api('/v13/deployments/'+d['id'])
 if v['readyState']=='READY':break
 assert v['readyState'] not in ['ERROR','CANCELED'],'Diagnostic build rejected'
 time.sleep(10)
else:raise RuntimeError('Diagnostic build deadline')
changed=False
try:
 assert api('/v4/aliases/staging.rezlee.com')['deploymentId']==previous
 api('/v2/deployments/'+d['id']+'/aliases',{'alias':'staging.rezlee.com'});changed=True;state['stage']='three-request-candidate-check';save()
 s=(r/'scripts/qa/closeout-feedback-ai-consented-20261021.mjs').read_text().replace('feedback-ai-consented-check.json','ai-recovery-hosted-check.json').replace(previous,d['id'])
 q=r/'scripts/qa/ai-recovery-hosted-check-20261022.mjs';q.write_text(s)
 x=subprocess.run(['/usr/local/bin/node',str(q)],cwd=r,capture_output=True,text=True,timeout=120);state['checkExit']=x.returncode
finally:
 if changed:
  assert api('/v4/aliases/staging.rezlee.com')['deploymentId']==d['id'],'Concurrent staging change; rollback not attempted'
  api('/v2/deployments/'+previous+'/aliases',{'alias':'staging.rezlee.com'})
 state['stagingRestored']=api('/v4/aliases/staging.rezlee.com')['deploymentId']==previous
 state['productionUnchanged']=api('/v4/aliases/rezlee.com')['deploymentId']==prod
 state['stage']='diagnostic-finished-staging-restored';save()

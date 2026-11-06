from pathlib import Path
import subprocess,json
from datetime import datetime,timezone
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');o=r/'docs/checkpoints/release-config-20261021'
team='team_RWL45V0YAuHJ7DvygUtJNB8o';project='prj_N0EruXgUNTjI7L8b564XexIPwHZU'
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js','api']
def api(path,body=None):
 cmd=cli+[path+('&' if '?' in path else '?')+'teamId='+team]
 if body is not None:cmd+=['--method','POST','--input','-']
 p=subprocess.run(cmd,input=json.dumps(body) if body is not None else None,capture_output=True,text=True,timeout=60)
 if p.returncode:raise RuntimeError('Vercel request failed; response suppressed')
 return json.loads(p.stdout)
values={
 'NEXT_PUBLIC_APP_URL':'https://staging.rezlee.com','NEXT_PUBLIC_SITE_URL':'https://staging.rezlee.com',
 'ACCOUNT_DELETION_ENABLED':'true','REZLEE_HOME_SNAPSHOT_ENABLED':'true',
 'REZLEE_MOBILE_AUTH_CONTEXT_ENABLED':'true','REZLEE_MOBILE_READ_BOOTSTRAP_ENABLED':'true','REZLEE_MOBILE_READ_BUDGET_ENABLED':'true',
 'REZLEE_STATEMENT_READING_ENABLED':'true','REZLEE_DECK_HOSTED_ENABLED':'true','REZLEE_DECK_TELECOM_ENABLED':'true',
 'GOOGLE_PLACES_ENABLED':'true','DECK_MOCK_MODE':'false','REZLEE_AI_DISABLED':'false','AI_ASSISTANT_PROVIDER':'auto',
 'REZLEE_MEMBERSHIPS_ENABLED':'true','REZLEE_PURCHASES_ENABLED':'true','REVENUECAT_ALLOW_SANDBOX':'true',
 'REZLEE_APP_NOTIFICATIONS_ENABLED':'true','REZLEE_EMAIL_CODE_ENABLED':'true',
}
before=api('/v10/projects/'+project+'/env')['envs']
existing={x['key']:x for x in before if 'preview' in x.get('target',[]) and not x.get('gitBranch')}
# Product identifiers/provider allow-list are non-secret and apply to the same app identifiers.
for name in ['REZLEE_STORE_PRODUCTS','REZLEE_DECK_LAUNCH_PROVIDERS']:
 entry=next((x for x in before if x['key']==name and 'production' in x.get('target',[]) and x.get('type')!='sensitive'),None)
 if entry:
  data=api('/v1/projects/'+project+'/env/'+entry['id'])
  value=data.get('value')
  if isinstance(value,str) and value and len(value)<2000:values[name]=value
plan={name:value for name,value in values.items() if name not in existing}
assert not any(any(s in name for s in ['SECRET','API_KEY','AUTH_TOKEN','WEBHOOK_AUTH']) for name in plan)
(o/'public-settings-plan.json').write_text(json.dumps({'at':datetime.now(timezone.utc).isoformat(),'projectId':project,'target':'preview','addOnly':plan,'source':'Agreed staging acceptance profile; product/provider identifiers from saved same-app production config','existingValuesOverwritten':False},indent=2)+'\n')
for name,value in plan.items():
 result=api('/v10/projects/'+project+'/env',{'key':name,'value':value,'type':'encrypted','target':['preview'],'comment':'Rezlee staging release contract, 2026-10-21; no production change'})
 if result.get('failed'):raise RuntimeError('Addition failed; inspect metadata before retrying')
after=api('/v10/projects/'+project+'/env')['envs']
new={x['key']:x for x in after if 'preview' in x.get('target',[]) and not x.get('gitBranch')}
assert all(name in new for name in plan)
prodBefore={(x['id'],x.get('updatedAt')) for x in before if 'production' in x.get('target',[])}
prodAfter={(x['id'],x.get('updatedAt')) for x in after if 'production' in x.get('target',[])}
assert prodBefore==prodAfter,'Production metadata changed unexpectedly; investigate'
report={'at':datetime.now(timezone.utc).isoformat(),'addedNames':sorted(plan),'addedCount':len(plan),'createdIds':{name:new[name]['id'] for name in plan},'previewOnly':True,'productionEntriesUnchanged':True,'existingValuesOverwritten':False,'deploymentPerformed':False}
(o/'public-settings-applied.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

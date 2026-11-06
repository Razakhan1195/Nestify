from pathlib import Path
from datetime import datetime,timezone
import os,time,json,subprocess,shlex,re
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');o=r/'docs/checkpoints/navigation-audit-20261021'
m=Path('/Users/razakhan/Library/Application Support/Rezlee/launch-candidate-20261021/navigation-mobile')
cli=['/usr/local/bin/node','/Users/razakhan/.npm/_npx/e25a38a8cc65d08e/node_modules/eas-cli/bin/run']
stamp=lambda:datetime.now(timezone.utc).isoformat()
state={'startedAt':stamp(),'pid':os.getpid(),'stage':'waiting_for_verified_archives','build':65,'buildId':'b5b610f2-cb82-4137-bb91-19f68dcf9a56','storeReviewSubmission':False,'publicRelease':False,'phoneAcceptance':False}
target=o/'ios-delivery-status.json'
if target.exists():raise SystemExit('Existing delivery record; inspect before attempting another submission.')
def save():
 state['checkedAt']=stamp();target.write_text(json.dumps(state,indent=2)+'\n')
def update_ledger():
 p=r/'docs/launch-execution-2026-10-21.json';d=json.loads(p.read_text())
 d['updatedAt']=stamp();d['candidateDelivery']['navigationCandidate']['iosDelivery']=state.copy();p.write_text(json.dumps(d,indent=2)+'\n')
save()
try:
 for tick in range(120):
  if (o/'build-watch-status.json').exists():
   watch=json.loads((o/'build-watch-status.json').read_text())
   if watch['stage'] in ['artifact_inspection_failed','watch_stopped_with_error','watch_deadline_reached']:raise RuntimeError('Build verification not complete')
   if watch['stage']=='archives_inspected':break
  save();time.sleep(30)
 else:raise RuntimeError('Build verification deadline reached')
 report=json.loads((o/'artifact-inspection.json').read_text())
 ios=next(x for x in report['builds'] if x['platform']=='IOS')
 assert ios['id']==state['buildId'] and ios['status']=='FINISHED' and ios['build']=='65'
 c=ios['embeddingChecks']
 for name in ['referralDesignEmbedded','stagingApiEmbedded','stagingDatabaseEmbedded','EXPO_PUBLIC_REVENUECAT_IOS_KEYMatchesEas','EXPO_PUBLIC_REVENUECAT_ANDROID_KEYMatchesEas']:assert c[name] is True,name
 assert c['productionDatabaseEmbedded'] is False
 assert c['nativeInfo']['CFBundleIdentifier']=='com.rezlee.app' and c['nativeInfo']['CFBundleVersion']=='65'
 perf=json.loads((r/'docs/checkpoints/release-config-20261021/performance-recovery/corrected-load-acceptance/reviewed-results.json').read_text())
 # Full measured acceptance has its separately preserved report and launch-ledger signoff.
 ledger=json.loads((r/'docs/launch-execution-2026-10-21.json').read_text())
 assert ledger['candidateDelivery']['latestPerformance']['pass'] is True
 for name in ['care-hosted-results.json','vault-hosted-results.json']:assert json.loads((o/name).read_text())['failure'] is None
 state['stage']='submitting_to_testflight';save();update_ledger();print(json.dumps(state),flush=True)
 env=os.environ.copy();env['EXPO_NO_DOTENV']='1';env['CI']='1';env.pop('EAS_BUILD_PROFILE',None)
 inner=shlex.join(['env','EAS_BUILD_PROFILE=apple-beta']+cli+['submit','--platform','ios','--profile','beta','--id',state['buildId'],'--non-interactive','--wait'])
 p=subprocess.run(cli+['env:exec','preview',inner,'--non-interactive'],cwd=m,env=env,capture_output=True,text=True,timeout=1800)
 raw=p.stdout+'\n'+p.stderr
 matches=re.findall(r'/submissions/([a-f0-9-]{36})',raw)
 state.update(stage='upload_command_completed_processing_unverified' if p.returncode==0 else 'submission_command_failed',exitCode=p.returncode,submissionId=matches[-1] if matches else None,finishedAt=stamp(),rawOutputSuppressed=True,installed=False,testerAvailabilityVerified=False)
 save();update_ledger();print(json.dumps(state),flush=True)
except Exception as e:
 state.update(stage='delivery_stopped_requires_inspection',errorType=type(e).__name__,finishedAt=stamp())
 save();update_ledger();print(json.dumps(state),flush=True)

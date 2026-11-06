from pathlib import Path
from datetime import datetime,timezone
import json,os,time,subprocess,math
r=Path('/Users/razakhan/Documents/rezlee-mobile-test');root=r/'docs/checkpoints/release-config-20261021';out=root/'performance-recovery/corrected-load-acceptance';pid=76718
def now():return datetime.now(timezone.utc).isoformat()
def write(p,x):tmp=p.with_suffix(p.suffix+'.tmp');tmp.write_text(json.dumps(x,indent=2)+'\n');tmp.replace(p)
watch={'at':now(),'pid':os.getpid(),'controllerPid':pid,'stage':'watching'};write(out/'recorder-status.json',watch);print(json.dumps(watch),flush=True)
deadline=time.monotonic()+90*60
while time.monotonic()<deadline:
 state=json.loads((out/'status.json').read_text())
 try:os.kill(pid,0);alive=True
 except ProcessLookupError:alive=False
 if state['stage'] in ['finished-pass','finished-failed'] and (out/'summary.json').exists():break
 if not alive:
  watch.update(at=now(),stage='controller-stopped-without-final-result',lastControllerStage=state['stage']);write(out/'recorder-status.json',watch);raise SystemExit(1)
 time.sleep(30)
else:
 watch.update(at=now(),stage='watch-deadline-no-pass-assumed');write(out/'recorder-status.json',watch);raise SystemExit(1)
summary=json.loads((out/'summary.json').read_text());report=json.loads((out/'soak-load-report.json').read_text()) if (out/'soak-load-report.json').exists() else {};rows=json.loads((out/'soak-rows.json').read_text()) if (out/'soak-rows.json').exists() else []
def pct(xs,p):return sorted(xs)[min(len(xs)-1,math.ceil(len(xs)*p)-1)] if xs else None
routes=[{'route':route,'requests':len(v:= [x for x in rows if x['route']==route]),'errors':sum(not x['valid'] for x in v),'p95Ms':pct([x['ms'] for x in v],.95),'p99Ms':pct([x['ms'] for x in v],.99)} for route in sorted(set(x['route'] for x in rows))]
memory=[]
for p in out.glob('capacity-*.prom'):
 for line in p.read_text().splitlines():
  if line.startswith('node_memory_MemAvailable_bytes ') or line.startswith('node_memory_MemTotal_bytes '):
   memory.append((line.split()[0],float(line.split()[-1])))
resources={name:{'minBytes':min(x for k,x in memory if k==name),'maxBytes':max(x for k,x in memory if k==name)} for name in set(k for k,x in memory)}
verdict=bool(summary.get('pass')) and report.get('complete') and len(rows)==54000 and report.get('distinctUsers')==300 and summary.get('cleanup',{}).get('verifiedAbsent')==300 and not summary.get('cleanup',{}).get('errors')
review={'at':now(),'deploymentId':'dpl_73wZA23j8AXLXYzi9snksdTittwQ','pass':verdict,'source':'Persisted final controller results; no extrapolation to AI/upload/provider capacity or phones','summary':summary,'routes':routes,'resources':resources,'startupWindow':report.get('startupWindow'),'generator':report.get('generator'),'total':report.get('phases',[None])[0],'originalFailedCandidatePreserved':True,'nativeAcceptance':'iOS64 installed on iPhone16Pro; customer journeys not measured; Android53 not uploaded'}
write(out/'reviewed-results.json',review)
phase=json.loads((root/'phase-status.json').read_text());phase.update(at=now(),stage='corrected_candidate_load_passed_phone_and_android_pending' if verdict else 'corrected_candidate_load_failed',loadPreparationRunning=False,loadTestRunning=False,loadControllerPid=pid,correctedLoadPass=verdict,nextAction='Complete observable installed-phone acceptance and secure Google Play upload' if verdict else 'Inspect corrected-load-acceptance/reviewed-results.json; retain failure and diagnose before further changes')
write(root/'phase-status.json',phase)
ledger=json.loads((r/'docs/launch-execution-2026-10-21.json').read_text());ledger['updatedAt']=now();ledger['currentObjective']=phase['nextAction']
for item in ledger['items']:
 if item['id']=='performance_sustained':
  item.setdefault('priorEvidence',[]).append({k:item[k] for k in ['status','environment','evidence','evidencePath'] if k in item})
  total=review['total'] or {}
  item.update(status='Verified in staging' if verdict else 'Failed on corrected candidate',environment='Established staging; dpl_73wZA23j8AXLXYzi9snksdTittwQ; Small2GB/pool5',evidence=json.dumps({'pass':verdict,'requests':total.get('requests'),'errors':total.get('failures'),'skipped':total.get('skipped'),'p95Ms':total.get('p95Ms'),'p99Ms':total.get('p99Ms'),'fixturesVerifiedAbsent':summary['cleanup']['verifiedAbsent']}),evidencePath='docs/checkpoints/release-config-20261021/performance-recovery/corrected-load-acceptance/reviewed-results.json',nextAction=phase['nextAction'])
ledger['candidateDelivery']['latestPerformance']={'pass':verdict,'status':'finished','evidencePath':'docs/checkpoints/release-config-20261021/performance-recovery/corrected-load-acceptance/reviewed-results.json'}
write(r/'docs/launch-execution-2026-10-21.json',ledger)
watch.update(at=now(),stage='finished',pass_=verdict);write(out/'recorder-status.json',watch);print(json.dumps({'at':now(),'stage':'finished','pass':verdict,'requests':len(rows),'routes':routes,'cleanup':summary['cleanup']}),flush=True)

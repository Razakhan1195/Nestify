"""Exercise USD admission on the network-isolated restore, never a hosted DB."""
from pathlib import Path
import json,subprocess,concurrent.futures,datetime
r=Path(__file__).resolve().parents[2]; docker='/Users/razakhan/.docker/bin/docker'; container='rezlee-restore-20261013'
info=json.loads(subprocess.check_output([docker,'inspect',container],text=True))[0]
assert info['HostConfig']['NetworkMode']=='none' and not info['HostConfig']['PortBindings']
def sql(s):
 p=subprocess.run([docker,'exec','-i',container,'psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],input=s,text=True,capture_output=True)
 if p.returncode:raise RuntimeError('Isolated SQL failed; no rows or credentials emitted')
 return p.stdout.strip()
assert sql("select to_regclass('public.rezlee_ai_spend_config') is null")=='t','Run only once in the named isolated rehearsal'
sql((r/'supabase/migrations/202610130004_ai_dollar_admission.sql').read_text())
assert sql("select public.reserve_rezlee_ai_spend('assistant','gemini-2.5-flash')")=='unavailable'
sql('update public.rezlee_ai_spend_config set enabled=true,daily_usd_cents=300,monthly_usd_cents=500,feature_daily_usd_cents=200,feature_monthly_usd_cents=400')
features=['assistant','repair','document','quote','gmail','maintenance']
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
 results=list(pool.map(lambda i:sql("select public.reserve_rezlee_ai_spend('"+features[i%6]+"','gemini-2.5-flash')"),range(48)))
assert results.count('allowed')==3 and results.count('limited')==45
assert sql("select reserved_usd_cents from public.rezlee_ai_spend_windows where scope='all' and kind='day'")=='300'
assert sql("select count(*) from public.rezlee_ai_spend_windows where scope<>'all' and kind='day' and reserved_usd_cents>200")=='0'
assert sql("select public.reserve_rezlee_ai_spend('assistant','unknown')")=='unavailable'
sql("update public.rezlee_ai_spend_config set price_review_before=now()-interval '1 second'")
assert sql("select public.reserve_rezlee_ai_spend('assistant','gemini-2.5-flash')")=='unavailable'
sql('update public.rezlee_ai_spend_config set enabled=false')
out={'passed':True,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'parallelRequests':48,'workers':12,'allowed':3,'limited':45,'dailyReservedCents':300,'featureCapsHeld':True,'unknownModelDenied':True,'expiredReviewDenied':True,'disabledByDefault':True,'hostedDatabaseTouched':False,'paidCalls':0,'isolatedConfigDisabledAfterTest':True}
(r/'docs/checkpoints/ai-dollar-budget-20261013/concurrency-results.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))

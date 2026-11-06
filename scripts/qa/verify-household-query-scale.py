"""Bounded query/index experiment in a disposable, isolated schema; no hosted load."""
from pathlib import Path
import json,subprocess,statistics,datetime
r=Path(__file__).resolve().parents[2];docker='/Users/razakhan/.docker/bin/docker';container='rezlee-restore-20261013';schema='qa_scale_20261013'
info=json.loads(subprocess.check_output([docker,'inspect',container],text=True))[0];assert info['HostConfig']['NetworkMode']=='none' and not info['HostConfig']['PortBindings']
def sql(s):
 p=subprocess.run([docker,'exec','-i',container,'psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],input=s,text=True,capture_output=True)
 if p.returncode:raise RuntimeError('Isolated query experiment failed: '+p.stderr[:800])
 return p.stdout.strip()
assert sql("select count(*) from pg_namespace where nspname='"+schema+"'")=='0'
sql('create schema '+schema)
rows=[]
try:
 for table,label,datecol,order,limit in [('documents','title','created_at','desc',100),('inventory_items','name','created_at','desc',100),('timeline_events','title','created_at','desc',12),('bills','name','due_date','asc nulls last',1000),('maintenance_tasks','title','due_date','asc nulls last',1000)]:
  full=schema+'.'+table;extra=',event_type' if table=='timeline_events' else '';extrav=",'fixture'" if extra else ''
  dateval="now() - (g%5000)*interval '1 hour'" if datecol=='created_at' else "current_date+(g%5000)"
  sql('create unlogged table '+full+' (like public.'+table+' including defaults including indexes);'+"insert into "+full+"(user_id,home_id,"+label+","+datecol+extra+") select md5('user-'||(case when g<=5000 then 0 else g%1000+1 end))::uuid,md5('home-'||(case when g<=5000 then 0 else g%1000+1 end))::uuid,'Synthetic scale record',"+dateval+extrav+" from generate_series(1,200000)g;analyze "+full)
  query="select * from "+full+" where user_id=md5('user-0')::uuid and home_id=md5('home-0')::uuid order by "+datecol+' '+order+' limit '+str(limit)
  def measure():
   plans=[json.loads(sql('explain (analyze,buffers,format json) '+query))[0] for _ in range(4)]
   return {'medianMs':round(statistics.median(p['Execution Time'] for p in plans[1:]),3),'sharedBlocks':plans[-1]['Plan'].get('Shared Hit Blocks',0)+plans[-1]['Plan'].get('Shared Read Blocks',0),'plan':plans[-1]['Plan']}
  before=measure();sql('create index '+table+'_owner_sort_qa on '+full+'(user_id,home_id,'+datecol+' '+order+');analyze '+full);after=measure()
  rows.append({'table':table,'totalRows':200000,'selectedHouseholdRows':5000,'limit':limit,'before':before,'after':after});print(table,round(before['medianMs'],3),'->',round(after['medianMs'],3),'ms',flush=True)
finally:sql('drop schema '+schema+' cascade')
p=r/'docs/checkpoints/performance-20261013';p.mkdir(exist_ok=True)
(p/'index-experiment.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tables':rows,'cleanup':True,'hostedLoad':False,'rlsAndNetworkIncluded':False,'note':'Actual table shapes and baseline indexes; synthetic data in an isolated temporary schema. Query experiment, not end-to-end throughput acceptance.'},indent=2)+'\n')

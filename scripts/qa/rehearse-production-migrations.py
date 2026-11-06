"""Apply candidate SQL only inside the explicitly network-isolated production clone."""
from pathlib import Path
import subprocess,json,hashlib,datetime
r=Path(__file__).resolve().parents[2];p=Path('/Users/razakhan/Library/Application Support/Rezlee/production-rehearsal-20261013');docker='/Users/razakhan/.docker/bin/docker';name='rezlee-production-rehearsal-20261013'
info=json.loads(subprocess.check_output([docker,'inspect',name],text=True))[0];assert info['HostConfig']['NetworkMode']=='none' and not info['HostConfig']['PortBindings']
cmd=[docker,'exec','-i',name,'psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq']
def sql(s):
 q=subprocess.run(cmd,input=s,text=True,capture_output=True)
 if q.returncode:raise RuntimeError(q.stderr[-1500:])
 return q.stdout.strip()
assert sql("show cron.launch_active_jobs")=='off'
record=p/'migration-rehearsal-status.json';status=json.loads(record.read_text()) if record.exists() else {'applied':[],'liveProductionWritten':False}
if not (p/'original-public-fingerprints.json').exists():
 tables=json.loads(sql("select json_agg(tablename order by tablename) from pg_tables where schemaname='public'"));baseline={}
 for table in tables:
  cols=json.loads(sql("select json_agg(column_name order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='"+table+"'"));projection=','.join('"'+c+'"' for c in cols)
  fingerprint=json.loads(sql('select json_build_object(\'rows\',count(*),\'hash\',md5(coalesce(string_agg(md5(to_jsonb(t)::text),\'\' order by md5(to_jsonb(t)::text)),\'\'))) from (select '+projection+' from public."'+table+'")t'))
  baseline[table]={'columns':cols,**fingerprint}
 (p/'original-public-fingerprints.json').write_text(json.dumps(baseline,indent=2))
versions=set(json.loads(sql('select json_agg(version) from supabase_migrations.schema_migrations')))
for f in sorted((r/'supabase/migrations').glob('*.sql')):
 version=f.name.split('_')[0]
 if version in versions:continue
 s=f.read_text();filename=f.stem[len(version)+1:];envelope='begin;\n'+s+"\ninsert into supabase_migrations.schema_migrations(version,name,statements) values('"+version+"','"+filename+"',array[$rezlee_sql$"+s+"$rezlee_sql$]);\ncommit;"
 q=subprocess.run(cmd,input=envelope,text=True,capture_output=True)
 (p/(f.stem+'.log')).write_text(q.stderr)
 if q.returncode:
  status['blockedAt']=f.name;record.write_text(json.dumps(status,indent=2));print('STOP',f.name,flush=True);print('\n'.join(l for l in q.stderr.splitlines() if l.startswith('ERROR:'))[:1500],flush=True);raise SystemExit(1)
 status['applied'].append({'file':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()});record.write_text(json.dumps(status,indent=2));print('APPLIED TO CLONE',f.name,flush=True)
status.pop('blockedAt',None);status['complete']=True;status['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();record.write_text(json.dumps(status,indent=2));print('All candidate migration files applied only to isolated clone',flush=True)

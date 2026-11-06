"""Read-only schema/ledger inventory; never promotes migrations or reads customer rows."""
from pathlib import Path
import subprocess,json,concurrent.futures,datetime
r=Path(__file__).resolve().parents[2];cli='/Users/razakhan/.npm/_npx/aa8e5c70f9d8d161/node_modules/supabase/dist/supabase.js'
query="""select json_build_object('tables',(select json_agg(tablename order by tablename) from pg_tables where schemaname='public'),'columns',(select json_agg(table_name||'.'||column_name||':'||data_type order by table_name,column_name) from information_schema.columns where table_schema='public'),'policies',(select json_agg(tablename||'.'||policyname order by tablename,policyname) from pg_policies where schemaname='public'),'functions',(select json_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' order by p.proname,p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),'migrations',(select json_agg(version order by version) from supabase_migrations.schema_migrations)) as inventory;"""
def read(ref):
 p=subprocess.run(['node',cli,'db','query','--linked','--project-ref',ref,'--output','json',query],cwd=r,text=True,capture_output=True)
 if p.returncode:raise RuntimeError('Read-only schema inventory failed for '+ref)
 return json.loads(p.stdout)[0]['inventory']
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:stage,production=list(pool.map(read,['gjwvalpxnfbvryosmcbj','eynbuhmtxkigvqoewbwi']))
difference={kind:sorted(set(stage[kind] or [])-set(production[kind] or [])) for kind in stage}
out={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'staging':stage,'production':production,'absentFromProduction':difference,'warning':'Object-name/column-type inventory only. Matching names do not establish matching function, policy, view, constraint, grant, trigger or runtime definitions. Do not blanket db push or repair migration history from this list.'}
p=r/'docs/checkpoints/overnight-release-20261013/production-schema-inventory.json';p.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'absentCounts':{k:len(v) for k,v in difference.items()},'absentTables':difference['tables'],'readOnly':True}))

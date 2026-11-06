"""Compare actual staging definitions with the isolated migrated production clone; read-only."""
from pathlib import Path
import json,subprocess,datetime
r=Path(__file__).resolve().parents[2];p=Path('/Users/razakhan/Library/Application Support/Rezlee/production-rehearsal-20261013')
cli='/Users/razakhan/.npm/_npx/aa8e5c70f9d8d161/node_modules/supabase/dist/supabase.js';docker='/Users/razakhan/.docker/bin/docker';name='rezlee-production-rehearsal-20261013'
query="""set search_path='';select json_build_object(
 'functions',(select json_object_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',md5(pg_get_functiondef(p.oid)) order by p.proname,p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'),
 'policies',(select json_object_agg(tablename||'.'||policyname,json_build_object('permissive',permissive,'roles',roles,'cmd',cmd,'qual',qual,'with_check',with_check) order by tablename,policyname) from pg_policies where schemaname='public'),
 'columns',(select json_object_agg(table_name||'.'||column_name,json_build_object('type',udt_name,'nullable',is_nullable,'default',column_default) order by table_name,column_name) from information_schema.columns where table_schema='public'),
 'constraints',(select json_object_agg(c.relname||'.'||t.conname,pg_get_constraintdef(t.oid) order by c.relname,t.conname) from pg_constraint t join pg_class c on c.oid=t.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
 'indexes',(select json_object_agg(indexname,indexdef order by indexname) from pg_indexes where schemaname='public'),
 'triggers',(select json_object_agg(c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
 'rls',(select json_object_agg(c.relname,json_build_object('enabled',c.relrowsecurity,'forced',c.relforcerowsecurity) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
 'tableGrants',(select json_object_agg(t.relname||'.'||x.role,json_build_object('select',has_table_privilege(x.role,t.oid,'SELECT'),'insert',has_table_privilege(x.role,t.oid,'INSERT'),'update',has_table_privilege(x.role,t.oid,'UPDATE'),'delete',has_table_privilege(x.role,t.oid,'DELETE'),'truncate',has_table_privilege(x.role,t.oid,'TRUNCATE')) order by t.relname,x.role) from pg_class t join pg_namespace n on n.oid=t.relnamespace cross join(values('anon'),('authenticated'),('service_role'))x(role) where n.nspname='public' and t.relkind='r'),
 'functionGrants',(select json_object_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||').' || x.role,has_function_privilege(x.role,p.oid,'EXECUTE') order by p.proname,p.oid,x.role) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join(values('anon'),('authenticated'),('service_role'))x(role) where n.nspname='public' and p.prokind='f'),
 'views',(select json_object_agg(viewname,md5(definition) order by viewname) from pg_views where schemaname='public'),
 'storagePolicies',(select json_object_agg(tablename||'.'||policyname,json_build_object('permissive',permissive,'roles',roles,'cmd',cmd,'qual',qual,'with_check',with_check) order by tablename,policyname) from pg_policies where schemaname='storage'),
 'authenticatorConfig',(select coalesce(to_jsonb(rolconfig),'[]'::jsonb) from pg_roles where rolname='authenticator')
) as schema;"""
info=json.loads(subprocess.check_output([docker,'inspect',name],text=True))[0];assert info['HostConfig']['NetworkMode']=='none' and not info['HostConfig']['PortBindings']
stage=subprocess.run(['node',cli,'db','query','--linked','--project-ref','gjwvalpxnfbvryosmcbj','--output','json',query],cwd=r,capture_output=True,text=True)
assert stage.returncode==0,'Staging read-only definition query failed'
stage=json.loads(stage.stdout)[0]['schema']
clone=subprocess.run([docker,'exec','-i',name,'psql','-U','supabase_admin','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],input=query,capture_output=True,text=True)
assert clone.returncode==0,'Isolated definition query failed'
clone=json.loads(clone.stdout)
for label,data in [('staging',stage),('clone',clone)]:
 f=p/(label+'-semantic-schema.json');f.write_text(json.dumps(data,indent=2));f.chmod(0o600)
diff={}
for kind in stage:
 a,b=stage[kind] or {},clone[kind] or {}
 if kind=='authenticatorConfig':
  diff[kind]={'staging':a,'clone':b};continue
 diff[kind]={'missingFromClone':sorted(set(a)-set(b)),'extraInClone':sorted(set(b)-set(a)),'different':sorted(k for k in set(a)&set(b) if a[k]!=b[k]),'stagingCount':len(a),'cloneCount':len(b)}
out={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'liveProductionWritten':False,'readOnly':True,'differences':diff,'note':'Function/view bodies compared by hash, effective privileges for anon/authenticated/service_role, table constraints/indexes/triggers/policies and RLS. Authenticator runtime config is a separate rollout step. No customer rows read by this comparison.'}
(r/'docs/checkpoints/overnight-release-20261013/production-semantic-comparison.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(diff,indent=2))

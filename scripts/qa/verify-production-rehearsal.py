from pathlib import Path
import json,subprocess,re,datetime
r=Path(__file__).resolve().parents[2];p=Path('/Users/razakhan/Library/Application Support/Rezlee/production-rehearsal-20261013');docker='/Users/razakhan/.docker/bin/docker';name='rezlee-production-rehearsal-20261013'
info=json.loads(subprocess.check_output([docker,'inspect',name],text=True))[0];assert info['HostConfig']['NetworkMode']=='none' and not info['HostConfig']['PortBindings']
def sql(s):
 q=subprocess.run([docker,'exec','-i',name,'psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],input=s,text=True,capture_output=True)
 if q.returncode:(p/'verification-private-error.log').write_text(q.stderr);raise RuntimeError('Isolated verification failed; private diagnostic saved')
 return q.stdout.strip()
assert sql('show cron.launch_active_jobs')=='off';status=json.loads((p/'migration-rehearsal-status.json').read_text());assert status['complete']
baseline=json.loads((p/'original-public-fingerprints.json').read_text());changed=[];counts=[]
for table,old in baseline.items():
 columns=','.join('"'+c+'"' for c in old['columns']);current=json.loads(sql('select json_build_object(\'rows\',count(*),\'hash\',md5(coalesce(string_agg(md5(to_jsonb(t)::text),\'\' order by md5(to_jsonb(t)::text)),\'\'))) from (select '+columns+' from public."'+table+'")t'))
 counts.append({'table':table,'before':old['rows'],'after':current['rows'],'originalFieldsUnchanged':old['hash']==current['hash']})
 if old['rows']!=current['rows'] or old['hash']!=current['hash']:changed.append(table)
fks=json.loads(sql("""select coalesce(json_agg(x),'[]') from(select c.conrelid::regclass::text child,c.confrelid::regclass::text parent,array(select quote_ident(a.attname) from unnest(c.conkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.ord) child_cols,array(select quote_ident(a.attname) from unnest(c.confkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num order by k.ord) parent_cols from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where c.contype='f' and n.nspname in('public','auth','storage'))x"""))
for fk in fks:
 conditions=' and '.join('c.'+x+' is not null' for x in fk['child_cols']);matches=' and '.join('p.'+b+'=c.'+a for a,b in zip(fk['child_cols'],fk['parent_cols']))
 assert sql('select count(*) from '+fk['child']+' c where '+conditions+' and not exists(select 1 from '+fk['parent']+' p where '+matches+')')=='0','FK integrity'
owners=json.loads(sql("select coalesce(json_agg(x),'[]') from(select distinct user_id from homes where rezlee_account_active(user_id) limit 2)x"));assert len(owners)==2
for owner in owners:
 uid=owner['user_id'];assert re.fullmatch(r'[0-9a-f-]{36}',uid)
 for table in ['documents','bills','providers','quote_reviews','bill_outcome_actions','purchase_decisions']:
  own=int(sql("select count(*) from public."+table+" where user_id='"+uid+"'"));result=sql("begin;set local role authenticated;select set_config('request.jwt.claim.sub','"+uid+"',true);select count(*) from public."+table+";select count(*) from public."+table+" where user_id<>'"+uid+"';rollback;").splitlines();assert int(result[-2])==own and int(result[-1])==0,'Private records isolated'
assert sql('select enabled from public.rezlee_ai_spend_config')=='f'
out={'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'migrationFilesApplied':len(status['applied']),'sourcePublicTables':len(baseline),'sourcePublicRows':sum(x['rows'] for x in baseline.values()),'tableChecks':counts,'originalTablesChanged':changed,'foreignKeysChecked':len(fks),'householdsTested':len(owners),'aiDollarAdmissionDisabledByDefault':True,'network':'none','cronDisabled':True,'liveProductionWritten':False,'limitations':['Database-only promotion rehearsal from actual production export; no production Storage bytes, HTTP stack, provider OAuth or live config changes.','Definition/grant/trigger comparison with staging and real production rollout acceptance remain separate gates.']}
(r/'docs/checkpoints/overnight-release-20261013/production-rehearsal-results.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k not in ['tableChecks']},indent=2))

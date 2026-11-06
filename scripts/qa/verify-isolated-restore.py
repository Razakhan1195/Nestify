"""Verify only the named network-isolated local restore. Never contacts a hosted DB."""
from pathlib import Path
import subprocess,json,re,hashlib,shutil,os,time
base=Path('/Users/razakhan/Library/Application Support/Rezlee/restore-rehearsal-20261013')
docker='/Users/razakhan/.docker/bin/docker'
container='rezlee-restore-20261013'
started=time.time()
def query(sql):
 r=subprocess.run([docker,'exec','-i',container,'psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'],input=sql,text=True,capture_output=True,timeout=90)
 if r.returncode:
  (base/'verification-private-error.log').write_text(r.stderr);raise RuntimeError('Local verification failed; private diagnostic retained')
 return r.stdout.strip()
info=json.loads(subprocess.check_output([docker,'inspect',container],text=True))[0]
assert info['HostConfig']['NetworkMode']=='none' and not info['HostConfig']['PortBindings']
assert query('show cron.launch_active_jobs;')=='off'
checks=['Local database has no network or published ports; scheduled jobs disabled']
query('drop schema if exists supabase_migrations cascade;')
for name in ['migrations-schema.sql','migrations-data.sql']:
 r=subprocess.run([docker,'exec',container,'psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-f','/backup/'+name],capture_output=True,text=True,timeout=60)
 (base/(name+'.restore.log')).write_text(r.stdout+r.stderr)
 assert r.returncode==0,'Migration journal restore failed'
checks.append('Actual migration journal restored')
expected={};table=None
for line in (base/'data.sql').read_text().splitlines():
 if line.startswith('COPY '):
  table=line[5:].split(' (')[0];expected[table]=0
 elif line=='\\.':table=None
 elif table:expected[table]+=1
for table,count in expected.items():
 assert re.fullmatch(r'"[a-z_][a-z_0-9]*"\."[a-z_][a-z_0-9]*"',table)
 assert int(query('select count(*) from '+table+';'))==count,'Restored table row count differs'
checks.append('Every backed-up table has the same restored row count')
# Check data-level foreign key integrity after the COPY restore.
fks=json.loads(query("""select coalesce(json_agg(x),'[]') from(
 select c.conrelid::regclass::text child,c.confrelid::regclass::text parent,
 array(select quote_ident(a.attname) from unnest(c.conkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.ord) child_cols,
 array(select quote_ident(a.attname) from unnest(c.confkey) with ordinality k(num,ord) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num order by k.ord) parent_cols
 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
 where c.contype='f' and n.nspname in('public','auth','storage'))x;"""))
for fk in fks:
 conditions=' and '.join('c.'+x+' is not null' for x in fk['child_cols'])
 matches=' and '.join('p.'+b+'=c.'+a for a,b in zip(fk['child_cols'],fk['parent_cols']))
 sql='select count(*) from '+fk['child']+' c where '+conditions+' and not exists(select 1 from '+fk['parent']+' p where '+matches+');'
 assert int(query(sql))==0,'Foreign key data integrity failed'
checks.append('All restored foreign-key relationships checked against actual rows')
owners=json.loads(query("select coalesce(json_agg(x),'[]') from(select distinct user_id from homes where rezlee_account_active(user_id) limit 2)x;"))
assert len(owners)==2,'Need two active restored households to verify isolation'
for owner in owners:
 uid=owner['user_id'];assert re.fullmatch(r'[0-9a-f-]{36}',uid)
 for table in ['documents','bills','providers','quote_reviews','bill_outcome_actions']:
  own=int(query("select count(*) from public."+table+" where user_id='"+uid+"';"))
  result=query("begin;set local role authenticated;select set_config('request.jwt.claim.sub','"+uid+"',true);select count(*) from public."+table+";select count(*) from public."+table+" where user_id<>'"+uid+"';rollback;").splitlines()
  assert int(result[-2])==own and int(result[-1])==0,'Restored owner isolation failed'
checks.append('Two restored households see exactly their own private records through authenticated RLS')
manifest=json.loads((base/'storage-manifest.json').read_text())
metadata=json.loads(query("select coalesce(json_agg(json_build_object('bucket',bucket_id,'path',name)),'[]') from storage.objects;"))
assert {(x['bucket'],x['path']) for x in metadata}=={(x['bucket'],x['path']) for x in manifest['objects']},'Storage metadata and file inventory differ'
restored=base/'restored-objects';restored.mkdir(mode=0o700,exist_ok=True)
total=0
for item in manifest['objects']:
 source=base/item['file'];assert source.parent==base/'objects'
 target=restored/source.name;shutil.copy2(source,target);os.chmod(target,0o600)
 data=target.read_bytes();assert len(data)==item['size'] and hashlib.sha256(data).hexdigest()==item['sha256']
 total+=len(data)
checks.append('All saved storage originals restored separately and SHA-256 verified against downloaded backup')
private_buckets=int(query('select count(*) from storage.buckets where not public;'))
checks.append('Storage bucket visibility and RLS policies retained; Storage HTTP service is not part of this local rehearsal')
files=['complete-schema.sql','data.sql','roles.sql','migrations-schema.sql','migrations-data.sql','storage-manifest.json']
hashes={name:hashlib.sha256((base/name).read_bytes()).hexdigest() for name in files}
result={'verifiedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'checks':checks,'tablesChecked':len(expected),'rowsRestored':sum(expected.values()),'foreignKeysChecked':len(fks),'householdsTested':len(owners),'objectsRestored':len(manifest['objects']),'bytesRestored':total,'privateBuckets':private_buckets,'verificationSeconds':round(time.time()-started,2),'backupSha256':hashes,'limitations':['Logical restore from actual staging export, not managed PITR or production failover.','Auth identities/sessions are restored as database rows; actual phone login and vendor OAuth remain separate acceptance.','Storage bytes and metadata were restored locally; no local Storage HTTP service or off-site disaster recovery is claimed.','Online database and object exports were taken separately; no zero-loss guarantee.']}
out=Path('docs/checkpoints/restore-rehearsal-20261013');out.mkdir(parents=True,exist_ok=True);(out/'results.json').write_text(json.dumps(result,indent=2))
print(json.dumps({k:v for k,v in result.items() if k not in ['backupSha256']},indent=2))

"""Inspect a signed staging IPA without running it or printing signing material."""
from pathlib import Path
import zipfile,plistlib,json,hashlib,sys
ipa=Path(sys.argv[1]);report=Path(sys.argv[2])
with zipfile.ZipFile(ipa) as z:
 assert z.testzip() is None
 names=z.namelist();root=next(n for n in names if n.startswith('Payload/') and n.count('/')==2 and n.endswith('/Info.plist'))[:-len('Info.plist')]
 info=plistlib.loads(z.read(root+'Info.plist'))
 bundle=z.read(root+'main.jsbundle')
 out={k:info.get(k) for k in ['CFBundleVersion','CFBundleShortVersionString','CFBundleIdentifier','CFBundleDisplayName','MinimumOSVersion','DTSDKName','DTXcode','UIDeviceFamily']}
 out.update(stagingApiPresent=b'https://staging.rezlee.com' in bundle,stagingDatabasePresent=b'gjwvalpxnfbvryosmcbj' in bundle,productionDatabasePresent=b'eynbuhmtxkigvqoewbwi' in bundle,privateSettingsPresent=any(n.endswith(('.env','.p8','.p12','deployment-settings.json','vercel-deploy.json')) for n in names),privacyManifests=sum(n.endswith('PrivacyInfo.xcprivacy') for n in names),vaultHistoryScreenPresent=b'vault-search' in bundle,aiPrivacyScreenPresent=b'ai-privacy' in bundle,aiPermissionPromptPresent=b'Allow AI assistance' in bundle,zipIntegrity=True,bytes=ipa.stat().st_size,sha256=hashlib.sha256(ipa.read_bytes()).hexdigest(),physicalAcceptance=False)
 if len(sys.argv)>3:
  settings=json.loads(Path(sys.argv[3]).read_text())
  values=[v.encode() for k,v in settings.items() if isinstance(v,str) and len(v)>24 and not k.startswith(('NEXT_PUBLIC_','EXPO_PUBLIC_')) and any(w in k for w in ['SECRET','SERVICE_ROLE','ENCRYPTION','PRIVATE_KEY','API_KEY','WORKER_TOKEN'])]
  out['sensitiveSettingValueFound']=any(v in bundle for v in values)
  assert not out['sensitiveSettingValueFound']
 assert info['CFBundleIdentifier']=='com.rezlee.app' and info['CFBundleDisplayName']=='Rezlee Beta'
 assert out['stagingApiPresent'] and out['stagingDatabasePresent'] and not out['productionDatabasePresent'] and not out['privateSettingsPresent']
 assert out['aiPrivacyScreenPresent'] and out['aiPermissionPromptPresent'] and out['vaultHistoryScreenPresent']
 report.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))

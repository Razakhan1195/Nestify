"""Inspect a completed APK without installing it or executing its contents."""
from pathlib import Path
import zipfile,struct,json,hashlib,sys
apk=Path(sys.argv[1]);report=Path(sys.argv[2])
def u32(b,p):return struct.unpack_from('<I',b,p)[0]
def manifest(b):
 strings=[];nodes=[];p=8
 while p<len(b):
  kind,header,size=struct.unpack_from('<HHI',b,p);assert size>=header and p+size<=len(b)
  if kind==1:
   count,styles,flags,start,_=struct.unpack_from('<IIIII',b,p+8)
   for i in range(count):
    at=p+start+u32(b,p+header+i*4)
    if flags&256:
     def length(pos):
      x=b[pos];return (((x&127)<<8)|b[pos+1],pos+2) if x&128 else (x,pos+1)
     _,at=length(at);n,at=length(at);strings.append(b[at:at+n].decode('utf8'))
    else:
     n=struct.unpack_from('<H',b,at)[0];at+=2
     if n&32768:n=((n&32767)<<16)|struct.unpack_from('<H',b,at)[0];at+=2
     strings.append(b[at:at+n*2].decode('utf-16le'))
  elif kind==258:
   name=strings[u32(b,p+20)];astart,asize,count=struct.unpack_from('<HHH',b,p+24);attrs={}
   for i in range(count):
    a=p+16+astart+i*asize;key=strings[u32(b,a+4)];raw=u32(b,a+8);typ=b[a+15];value=u32(b,a+16)
    attrs[key]=strings[raw] if raw!=0xffffffff else strings[value] if typ==3 else bool(value) if typ==18 else value
   nodes.append((name,attrs))
  p+=size
 return nodes
with zipfile.ZipFile(apk)as z:
 assert z.testzip() is None
 nodes=manifest(z.read('AndroidManifest.xml'));top=next(v for k,v in nodes if k=='manifest');sdk=next(v for k,v in nodes if k=='uses-sdk');app=next(v for k,v in nodes if k=='application')
 permissions=[v['name'] for k,v in nodes if k=='uses-permission'];assert top['package']=='com.rezlee.app'
 assert 'android.permission.SYSTEM_ALERT_WINDOW' not in permissions
 libs=[];bad=[];data=apk.read_bytes()
 for n in z.namelist():
  if n.startswith(('lib/arm64-v8a/','lib/x86_64/')) and n.endswith('.so'):
   b=z.read(n);assert b[:4]==b'\x7fELF' and b[4]==2 and b[5]==1
   offset=struct.unpack_from('<Q',b,32)[0];entry,count=struct.unpack_from('<HH',b,54);align=[]
   for i in range(count):
    ph=struct.unpack_from('<IIQQQQQQ',b,offset+i*entry)
    if ph[0]==1:align.append(ph[7])
   zi=z.getinfo(n);filename,extra=struct.unpack_from('<HH',data,zi.header_offset+26);dataoffset=zi.header_offset+30+filename+extra
   okay=bool(align) and min(align)>=16384 and (zi.compress_type!=0 or dataoffset%16384==0)
   libs.append({'path':n,'minimumLoadAlignment':min(align),'uncompressedZipAligned':zi.compress_type!=0 or dataoffset%16384==0})
   if not okay:bad.append(n)
 bundle=z.read('assets/index.android.bundle');stage=b'gjwvalpxnfbvryosmcbj' in bundle and b'https://staging.rezlee.com' in bundle;prod=b'eynbuhmtxkigvqoewbwi' in bundle
 assert stage and not prod and not bad
 out={'artifact':apk.name,'package':top['package'],'versionCode':top.get('versionCode'),'versionName':top.get('versionName'),'sdk':sdk,'debuggable':app.get('debuggable',False),'permissions':permissions,'stagingOnly':stage and not prod,'zipIntegrity':True,'elf64LibrariesChecked':len(libs),'alignmentFailures':bad,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'realPhoneOr16KbRuntimeTest':False}
 out['permissionDetails']=[v for k,v in nodes if k=='uses-permission']
 out['aiPrivacyScreenPresent']=b'ai-privacy' in bundle
 out['aiPermissionPromptPresent']=b'Allow AI assistance' in bundle
 if len(sys.argv)>3:
  settings=json.loads(Path(sys.argv[3]).read_text())
  values=[v.encode() for k,v in settings.items() if isinstance(v,str) and len(v)>24 and not k.startswith(('NEXT_PUBLIC_','EXPO_PUBLIC_')) and any(w in k for w in ['SECRET','SERVICE_ROLE','ENCRYPTION','PRIVATE_KEY','API_KEY','WORKER_TOKEN'])]
  out['sensitiveSettingValueFound']=any(v in bundle for v in values)
  assert not out['sensitiveSettingValueFound']
 assert not out['debuggable'];report.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))

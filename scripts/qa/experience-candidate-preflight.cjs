const fs=require('node:fs');
const root='/Users/razakhan/Library/Application Support/Rezlee/launch-candidate-20261021/experience-mobile';
const profiles=JSON.parse(fs.readFileSync(root+'/eas.json','utf8')).build;
function resolve(name,seen=new Set()){if(seen.has(name)||!profiles[name])throw Error('Invalid EAS profile inheritance');seen.add(name);const p=profiles[name];return {...(p.extends?resolve(p.extends,seen):{}),...(p.env||{})};}
const env={...process.env,...resolve('apple-beta'),EAS_BUILD_PROFILE:'apple-beta'};
const environment=require(root+'/scripts/release-config.cjs').validateReleaseConfig(env);
const crash=require(root+'/scripts/crash-config.cjs').crashConfig(env,environment);
const required=['EXPO_PUBLIC_SOCIAL_AUTH_READY','EXPO_PUBLIC_APPLE_AUTH_READY','EXPO_PUBLIC_EMAIL_CODE_READY'];
if(required.some(k=>env[k]!=='true'))throw Error('Staging sign-in readiness flags incomplete');
if(!env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.startsWith('appl_')||!env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?.startsWith('goog_'))throw Error('Platform purchase configuration missing');
if(!crash.enabled)throw Error('Staging crash reporting is not configured');
const result={at:new Date().toISOString(),profile:'apple-beta',environment,api:'https://staging.rezlee.com',databaseRef:'gjwvalpxnfbvryosmcbj',publicKeyRoleValidated:true,socialFlagsEnabled:true,platformPurchaseKeysPresent:true,crashReportingConfigured:true,sourceMapSecret:'EAS cloud secret presence listed; cloud upload still requires verification',nativeAcceptance:false};
fs.writeFileSync('/Users/razakhan/Documents/rezlee-mobile-test/docs/checkpoints/experience-refinement-20261021/eas-preflight.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));

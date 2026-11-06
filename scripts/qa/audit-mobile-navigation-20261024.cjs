const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
const root=process.cwd(),app=path.join(root,'apps/mobile/app'),out=path.join(root,'docs/checkpoints/experience-audit-20261024/navigation');fs.mkdirSync(out,{recursive:true});
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const sources=files(app).concat(files(path.join(root,'apps/mobile/src'))).filter(p=>/\.tsx?$/.test(p)),routeFiles=files(app).filter(p=>p.endsWith('.tsx')&&!['_layout.tsx','+native-intent.tsx'].includes(path.basename(p)));
function route(p){return '/'+path.relative(app,p).replace(/\.tsx$/,'').replace(/(^|\/)index$/,'').replace(/\/$/,'');}
function normalize(s){return s.split('?')[0].replace(/\/\([^/]+\)/g,'').replace(/\/$/,'')||'/';}
const patterns=routeFiles.map(p=>normalize(route(p))),links=[],modals=[],screens=[];
function exists(target){const t=normalize(target);return patterns.some(p=>p===t||new RegExp('^'+p.split('/').map(x=>x.startsWith('[')?'[^/]+':x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/')+'$').test(t));}
function literal(n){if(!n)return null;if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text;if(ts.isTemplateExpression(n))return n.head.text+n.templateSpans.map(s=>'__dynamic__'+s.literal.text).join('');if(ts.isAsExpression(n)||ts.isParenthesizedExpression(n))return literal(n.expression);if(ts.isObjectLiteralExpression(n)){const p=n.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText()==='pathname');return p?literal(p.initializer):null;}return null;}
for(const p of sources){
 const text=fs.readFileSync(p,'utf8'),tree=ts.createSourceFile(p,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),relative=path.relative(root,p),frameTags=new Set();
 function add(target,node,kind){if(target?.startsWith('/'))links.push({file:relative,line:tree.getLineAndCharacterOfPosition(node.getStart()).line+1,target,kind,routeExists:exists(target)});}
 function visit(n){
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&['push','replace','navigate','dismissTo'].includes(n.expression.name.text)&&/router/i.test(n.expression.expression.getText(tree)))add(literal(n.arguments[0]),n,'navigation');
  if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){
   const tag=n.tagName.getText(tree);frameTags.add(tag);
   const attrs=n.attributes.properties;for(const a of attrs)if(ts.isJsxAttribute(a)&&['href','fallback'].includes(a.name.getText(tree))){const v=a.initializer;add(v&&ts.isJsxExpression(v)?literal(v.expression):literal(v),a,a.name.getText(tree));}
   if(tag==='Modal'||tag==='SafeAreaModal')modals.push({file:relative,line:tree.getLineAndCharacterOfPosition(n.getStart()).line+1,androidDismissHandler:attrs.some(a=>ts.isJsxAttribute(a)&&a.name.getText(tree)==='onRequestClose'),propsForwarded:attrs.some(ts.isJsxSpreadAttribute)});
  }
  ts.forEachChild(n,visit);
 }visit(tree);
 if(routeFiles.includes(p))screens.push({file:relative,route:route(p),sha256:crypto.createHash('sha256').update(text).digest('hex'),navigationComponents:[...frameTags].filter(t=>/Frame|Navigation|Redirect|Header|Screen|Loading/.test(t)),hasHistoryFallback:/safeBack|canGoBack/.test(text),phoneAcceptance:'not observed',classification:'source inventory only; component presence is not an end-to-end pass'});
}
const report={at:new Date().toISOString(),scope:'Static route-target and modal-dismissal audit. Does not exercise native UI, conditional state, system back, keyboard or live services.',routeCount:screens.length,linkCount:links.length,unresolvedLinks:links.filter(x=>!x.routeExists),modals,screens,links};
fs.writeFileSync(path.join(out,'navigation-inventory.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({routeCount:report.routeCount,links:links.length,unresolvedLinks:report.unresolvedLinks,modalsWithoutExplicitClose:modals.filter(m=>!m.androidDismissHandler&&!m.propsForwarded)},null,2));

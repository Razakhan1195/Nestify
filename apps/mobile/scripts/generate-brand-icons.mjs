import sharp from 'sharp';
import {readFile, writeFile, copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const mobile=path.join(root,'apps/mobile');
const source=await readFile(path.join(root,'public/rezlee-mark.svg'),'utf8');
// Keep the canonical ribbon geometry; only invert its colour for the launcher.
const mark=source.replace(/<svg[^>]*>/,'').replace('</svg>','').replaceAll('#244c40','#F7F4EC');
const svg=(background,scale,offset)=>`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${background?'<rect width="1024" height="1024" fill="#244c40"/>':''}<g fill="none" transform="translate(${offset} ${offset}) scale(${scale})">${mark}</g></svg>`;
// iOS owns its corner mask. Android artwork stays inside the adaptive safe zone.
await sharp(Buffer.from(svg(true,22,160))).removeAlpha().png().toFile(path.join(mobile,'assets/icon.png'));
await sharp(Buffer.from(svg(false,18,224))).png().toFile(path.join(mobile,'assets/adaptive-icon.png'));
await copyFile(path.join(mobile,'assets/icon.png'),path.join(mobile,'ios/Rezlee/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png'));
const configPath=path.join(mobile,'app.json');
const config=JSON.parse(await readFile(configPath,'utf8'));
config.expo.android.adaptiveIcon={...config.expo.android.adaptiveIcon,foregroundImage:'./assets/adaptive-icon.png',backgroundColor:'#244c40'};
await writeFile(configPath,JSON.stringify(config,null,2)+'\n');
for(const name of ['icon.png','adaptive-icon.png']){
 const {width,height,hasAlpha}=await sharp(path.join(mobile,'assets',name)).metadata();
 console.log(JSON.stringify({name,width,height,hasAlpha}));
}

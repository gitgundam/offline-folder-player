import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const names=['index.html','style.css','app.js','reader.js','runtime-paths.js','manifest.webmanifest','icon.svg','controls/input.js','controls/touch.js','controls/touch.css','controls/nipplejs.js','controls/NIPPLEJS-LICENSE.txt'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files={};let bytes=0;
for(const name of names){const data=await readFile(new URL(name,root));files[name==='index.html'?'':name]=hash(data);bytes+=data.length}
const sw=(await readFile(new URL('sw.js',root),'utf8')).replace(/\n\/\/ launcher-build: [a-f0-9]+\s*$/,'').trimEnd()+'\n';
const build=hash(JSON.stringify(files)+sw).slice(0,16);
await writeFile(new URL('precache.js',root),'self.LAUNCHER_BUILD='+JSON.stringify(build)+';\nself.LAUNCHER_FILES='+JSON.stringify(files)+';\n');
await writeFile(new URL('sw.js',root),sw+'\n// launcher-build: '+build+'\n');
let publishedBytes=bytes;
for(const name of ['sw.js','precache.js'])publishedBytes+=(await stat(new URL(name,root))).size;
console.log(JSON.stringify({build,cachedFiles:names.length,cachedBytes:bytes,publishedBytes}));

'use strict';
const BLOCK=1024*1024,MAX_READS=4;let files=new Map(),manifest,expected=new Map(),active=0,maxActive=0;const queue=[],verified=new Set(),blocks=new Map();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
function normalized(path){const value=decodeURIComponent(path).replace(/^\/+/, '');if(value.includes('\\')||value.split('/').some(s=>s==='..'||s==='.'||!s))throw new Error('资源路径无效：'+path);return value.toLowerCase()}
function take(){return new Promise(resolve=>{queue.push(resolve);pump()})}function pump(){while(active<MAX_READS&&queue.length){active++;maxActive=Math.max(maxActive,active);queue.shift()()}}function release(){active--;pump()}
async function chunk(file,name,index){
 const key=name+':'+index;if(blocks.has(key)){const b=blocks.get(key);blocks.delete(key);blocks.set(key,b);return b}
 await take();try{const data=await file.slice(index*BLOCK,Math.min(file.size,(index+1)*BLOCK)).arrayBuffer();const item=expected.get(name),hash=item.chunks[index];if(!hash||hex(await crypto.subtle.digest('SHA-256',data))!==hash)throw new Error('资源 SHA-256 不匹配：'+item.path+'（分块 '+index+'）');verified.add(key);blocks.set(key,data);while(blocks.size>4)blocks.delete(blocks.keys().next().value);return data}finally{release()}
}
function lookup(path){const name=normalized(path),file=files.get(name);if(!file)throw new Error('缺少资源：'+path);return {name,file}}
const mime=path=>/\.wasm$/i.test(path)?'application/wasm':/\.js$/i.test(path)?'text/javascript; charset=utf-8':/\.html$/i.test(path)?'text/html; charset=utf-8':/\.json$/i.test(path)?'application/json':/\.css$/i.test(path)?'text/css':/\.png$/i.test(path)?'image/png':/\.svg$/i.test(path)?'image/svg+xml':/\.woff2$/i.test(path)?'font/woff2':'application/octet-stream';
async function initialize(entries){
 files=new Map();expected=new Map();blocks.clear();verified.clear();
 for(const {path,file}of entries){const parts=path.split('/');parts.shift();const name=normalized(parts.join('/'));if(files.has(name))throw new Error('目录存在重名资源：'+path);files.set(name,file)}
 const descriptor=files.get('iphone-build.json');if(!descriptor)throw new Error('目录选错：请选择包含 iphone-build.json 的 PlayGTA5-iPhone 文件夹');
 manifest=JSON.parse(await descriptor.text());if(manifest.format!=='playgta5-local-folder-v1'||manifest.sourceBuild!=='8b0b5899ed'||manifest.chunkBytes!==BLOCK)throw new Error('不支持这个资源目录版本');
 const missing=[];for(const item of manifest.files){const name=normalized(item.path),file=files.get(name);if(expected.has(name))throw new Error('校验清单有重复路径');expected.set(name,item);if(!file)missing.push('缺少 '+item.path);else if(file.size!==item.bytes)missing.push('大小不符 '+item.path);if(item.chunks?.length!==Math.ceil(item.bytes/BLOCK))throw new Error('分块清单错误：'+item.path)}
 if(missing.length)throw new Error('资源不完整（'+missing.length+' 项）：\n'+missing.slice(0,12).join('\n'));
 postMessage({type:'ready',count:expected.size,bytes:manifest.totalBytes,language:manifest.language,sourceBuild:manifest.sourceBuild});
}
function ranges(request){
 const url=new URL(request.path,'https://local.invalid');
 if(request.method==='POST'){
  if(url.pathname!=='/data/batch')throw new Error('不支持的资源请求');const runs=JSON.parse(request.body);if(!Array.isArray(runs)||runs.length>1000)throw new Error('批量读取参数无效');let total=0;const lengths=[];
  const parts=runs.map(([path,start,end])=>{const {name,file}=lookup('data/'+path);if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start)throw new Error('批量字节范围无效');const length=Math.max(0,Math.min(end+1,file.size)-start);total+=length;lengths.push(length);return {name,file,start,length}});if(total>64*BLOCK)throw new Error('批量读取超过 64 MiB');return {parts,status:200,headers:{'Content-Type':'application/octet-stream','Content-Length':String(total),'X-Run-Lengths':lengths.join(',')}};
 }
 const path=url.pathname==='/'?'index.html':url.pathname,{name,file}=lookup(path);let start=0,end=file.size-1,status=200;const headers={'Content-Type':mime(path),'Content-Length':String(file.size),'Accept-Ranges':'bytes'};
 if(request.range){const match=request.range.match(/^bytes=(\d*)-(\d*)$/);if(!match||(!match[1]&&!match[2]))throw new Error('字节范围无效');if(!match[1])start=Math.max(0,file.size-Number(match[2]));else start=Number(match[1]);if(match[1]&&match[2])end=Math.min(end,Number(match[2]));if(start>end||start>=file.size)return {parts:[],status:416,headers:{'Content-Range':'bytes */'+file.size,'Content-Length':'0'}};status=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+file.size;headers['Content-Length']=String(end-start+1)}
 return {parts:request.method==='HEAD'?[]:[{name,file,start,length:Math.max(0,end-start+1)}],status,headers};
}
function serve(request,port){
 const path=new URL(request.path,'https://local.invalid').pathname;
 if(request.method!=='POST'&&!files.has(normalized(path==='/'?'index.html':path))){
  port.onmessage=e=>{if(e.data?.type==='pull')port.postMessage({type:'done'});port.close()};
  port.postMessage({type:'headers',status:404,headers:{'Content-Length':'0','Content-Type':'text/plain; charset=utf-8'}});return;
 }
 let result;try{result=ranges(request)}catch(e){port.postMessage({type:'error',error:String(e.message||e)});postMessage({type:'error',error:String(e.message||e)});port.close();return}
 let part=0,offset=0,busy=false,cancelled=false;port.onmessage=async e=>{
  if(e.data?.type==='cancel'){cancelled=true;port.close();return}if(e.data?.type!=='pull'||busy||cancelled)return;busy=true;
  try{while(part<result.parts.length&&offset>=result.parts[part].length){part++;offset=0}if(part===result.parts.length){port.postMessage({type:'done'});port.close();return}const p=result.parts[part],at=p.start+offset,index=Math.floor(at/BLOCK),block=await chunk(p.file,p.name,index);if(cancelled)return;const begin=at-index*BLOCK,size=Math.min(block.byteLength-begin,p.length-offset),data=block.slice(begin,begin+size);offset+=size;port.postMessage({type:'chunk',data},[data])}
  catch(e){const error=String(e.message||e);port.postMessage({type:'error',error});postMessage({type:'error',error});port.close()}finally{busy=false}
 };
 port.postMessage({type:'headers',status:result.status,headers:result.headers});
}
self.onmessage=e=>{if(e.data.type==='index')initialize(e.data.entries).catch(e=>postMessage({type:'error',error:String(e.message||e)}));else if(e.data.type==='request')serve(e.data.request,e.ports[0]);else if(e.data.type==='stats')postMessage({type:'stats',active,maxActive,verifiedChunks:verified.size,cachedChunks:blocks.size})};

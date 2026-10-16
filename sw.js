'use strict';
importScripts('./precache.js','./runtime-paths.js');
const BASE=new URL(self.registration.scope).pathname;
const PREFIX='offline-folder-player:'+BASE+':';
const CACHE=PREFIX+self.LAUNCHER_BUILD;
const scoped=path=>new URL(path||'./',self.registration.scope).href;
const boot=new Set(Object.keys(self.LAUNCHER_FILES));
const owners=new Map();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const isolated=headers=>{const h=new Headers(headers);h.set('Cross-Origin-Opener-Policy','same-origin');h.set('Cross-Origin-Embedder-Policy','require-corp');h.set('Cross-Origin-Resource-Policy','same-origin');h.set('Content-Security-Policy',"default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob: data:; object-src 'none'");return h};
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 for(const [path,hash]of Object.entries(self.LAUNCHER_FILES)){
  const response=await fetch(scoped(path),{cache:'reload'});if(!response.ok)throw new Error('启动器下载失败：'+path);
  const bytes=await response.arrayBuffer();const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(actual!==hash)throw new Error('启动器校验失败：'+path);
  await cache.put(scoped(path),new Response(bytes,{status:200,headers:isolated(response.headers)}));
 }
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await self.clients.claim();
 for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);
})()));
self.addEventListener('message',event=>{
 const m=event.data;
 if(m?.type==='mount'&&event.source?.id&&/^[a-f0-9]{32}$/.test(m.session))owners.set(m.session,event.source.id);
 if(m?.type==='unmount'&&owners.get(m.session)===event.source?.id)owners.delete(m.session);
 if(m?.type==='status')event.waitUntil((async()=>{const cache=await caches.open(CACHE),keys=await cache.keys();event.ports[0]?.postMessage({build:self.LAUNCHER_BUILD,cached:keys.length,expected:boot.size,ready:keys.length===boot.size,paths:keys.map(r=>new URL(r.url).pathname)})})());
});
async function owner(session){
 const get=()=>owners.has(session)?self.clients.get(owners.get(session)):Promise.resolve(null);
 let client=await get();if(client)return client;
 for(const c of await self.clients.matchAll({type:'window',includeUncontrolled:true}))c.postMessage({type:'reconnect',session});
 const until=Date.now()+3500;
 while(Date.now()<until){client=await get();if(client)return client;await sleep(30)}
 return null;
}
async function gameResponse(event,session,path){
 const client=await owner(session);if(!client)return new Response('资源目录已断开，请回启动器重新选择目录。',{status:503,headers:isolated({'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'})});
 const request=event.request,body=request.method==='POST'?await request.text():undefined;
 if((body?.length||0)>1024*1024)return new Response('批量请求过大',{status:413});
 const channel=new MessageChannel();let controller,settled=false,resolved=false,timer,pullResolve;
 const response=await new Promise(resolve=>{
  const fail=error=>{if(settled)return;settled=true;clearTimeout(timer);pullResolve?.();if(resolved)controller?.error(new Error(error));else resolve(new Response(error,{status:503,headers:isolated({'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'})}));channel.port1.postMessage({type:'cancel'});channel.port1.close()};
  const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>fail('读取手机目录超时，请重新选择目录。'),60000)};
  channel.port1.onmessage=event=>{
   const m=event.data;if(settled)return;reset();
   if(m.type==='headers'){
    resolved=true;const headers=isolated(m.headers);headers.set('Cache-Control','no-store');
    if(request.method==='HEAD'||[204,304].includes(m.status)){settled=true;clearTimeout(timer);channel.port1.postMessage({type:'cancel'});channel.port1.close();resolve(new Response(null,{status:m.status,headers}));return}
    const stream=new ReadableStream({start(c){controller=c},pull(){return new Promise(resolve=>{pullResolve=resolve;channel.port1.postMessage({type:'pull'})})},cancel(){settled=true;clearTimeout(timer);pullResolve?.();channel.port1.postMessage({type:'cancel'});channel.port1.close()}});
    resolve(new Response(stream,{status:m.status,headers}));
   }else if(m.type==='chunk'){controller.enqueue(new Uint8Array(m.data));const ready=pullResolve;pullResolve=null;ready?.()}else if(m.type==='done'){settled=true;clearTimeout(timer);controller?.close();pullResolve?.();channel.port1.close()}else if(m.type==='error')fail(m.error);
  };
  reset();client.postMessage({type:'read',session,request:{path,method:request.method,range:request.headers.get('Range'),body}},[channel.port2]);
 });
 const name=path.split('?')[0];
 if(response.ok&&(name==='/'||name==='/index.html'||/^\/b\/[^/]+\/(loader|game|io_worker|wgpu_worker)\.js$/.test(name))){
  const headers=new Headers(response.headers);headers.delete('Content-Length');headers.delete('ETag');
  return new Response(FolderRuntime.adapt(name,await response.text(),BASE,session),{status:response.status,headers});
 }
 return response;
}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
 if(!url.pathname.startsWith(BASE))return;
 const path=url.pathname.slice(BASE.length);
 const match=path.match(/^__game\/([a-f0-9]{32})\/(.*)$/);
 if(match){event.respondWith(gameResponse(event,match[1],'/'+match[2]+url.search));return}
 if(path==='log'){event.respondWith(new Response(null,{status:204}));return}
 const key=path==='index.html'?'':path;
 if(boot.has(key)){event.respondWith((async()=>{const response=await(await caches.open(CACHE)).match(scoped(key));return response||new Response('启动器缓存不完整，请联网重新准备。',{status:503})})());return}
 if(/^(b\/|data\/|__support\/)/.test(path))event.respondWith(new Response('资源请求缺少目录会话；请从启动器进入。',{status:503}));
});

// launcher-build: 99442fd85911ad2f

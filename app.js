'use strict';
const $=id=>document.getElementById(id),frame=$('game');
const base=new URL('./',document.baseURI),scoped=path=>new URL(path,base).pathname;
$('choose').disabled=true;
let reader,session,registration,chosen=false,requestNo=0,channels=[];
const state=window.launcherState={directoryReady:false,world:false,fps:[],errors:[],cache:null};
let diagnosticStorage;try{diagnosticStorage=localStorage}catch{}
const journal=StartupLog.create({storage:diagnosticStorage});
const environment=()=>({userAgent:navigator.userAgent,isolated:crossOriginIsolated,webGPU:!!navigator.gpu,build:state.cache?.build,files:state.files,bytes:state.bytes,resolution:'960x540',cores:2,fpsLimit:30});
const recovered=journal.snapshot();
if(recovered.interrupted||recovered.current?.status==='error'){$('diagnostics').open=true;$('diagnostic-message').textContent='上次运行在「'+recovered.current.phase+'」结束，'+(recovered.current.percent===null?'':'进度 '+recovered.current.percent+'%。')+'这条记录不能单独确定崩溃原因；请复制排查信息。';}
const coldOffline=!navigator.onLine;
const defaults={size:1,opacity:.6,sensitivity:1,autoSprint:true};
function preferences(){try{return {...defaults,...JSON.parse(localStorage.getItem('playgta5.touch.settings')||'{}')}}catch{return {...defaults}}}
function error(value){const text=String(value?.message||value);$('error').textContent=text;if(!state.errors.includes(text))state.errors.push(text);state.errors=state.errors.slice(-20);journal.fault(value)}
function rpc(worker,message){return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(new Error('启动器状态查询超时')),10000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data)};worker.postMessage(message,[channel.port2])})}
async function prepare(){
 $('prepare').disabled=true;$('offline-status').textContent='正在校验并缓存小启动器…';
 try{
  if(!isSecureContext)throw new Error('请通过 localhost 或 HTTPS 打开启动器。');
  const existing=await navigator.serviceWorker.getRegistration(base.href);
  registration=!navigator.onLine&&existing?.active?existing:await navigator.serviceWorker.register(scoped('sw.js'),{scope:base.pathname,updateViaCache:'none'});
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('离线读取层尚未接管页面，请刷新后重试。')),12000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(t);resolve()},{once:true})});
  state.cache=await rpc(navigator.serviceWorker.controller,{type:'status'});
  if(!state.cache.ready)throw new Error('启动器缓存不完整，请联网重试。');
  if(!crossOriginIsolated){
   const reloadKey='folder-player.isolationReload:'+state.cache.build;
   if(sessionStorage.getItem(reloadKey))throw new Error('当前浏览器未启用所需的共享内存隔离，请使用普通模式打开本站或换兼容浏览器。');
   sessionStorage.setItem(reloadKey,'1');$('offline-status').textContent='离线入口已准备，正在启用运行环境…';location.reload();return;
  }
  sessionStorage.removeItem('folder-player.isolationReload:'+state.cache.build);
  state.isolated=true;$('choose').disabled=false;
  $('diagnostic-build').textContent='启动器版本 '+state.cache.build;
  const verified=localStorage.getItem('playgta5.offlineVerified')===state.cache.build;
  if(coldOffline){localStorage.setItem('playgta5.offlineVerified',state.cache.build);$('offline-status').textContent='离线已准备好：本次已从离线入口启动。'}
  else $('offline-status').textContent=verified?'离线已准备好。':'启动器已缓存；断网后关闭并重开一次，完成离线验收。';
  $('prepare').textContent='重新检查离线入口';
 }catch(e){$('offline-status').textContent='离线准备未完成';error(e)}finally{$('prepare').disabled=false}
}
function closeSession(){for(const channel of channels)channel.close();channels=[];if(session)navigator.serviceWorker.controller?.postMessage({type:'unmount',session});session=null}
function unmount(){closeSession();reader?.terminate();reader=null;chosen=false;state.directoryReady=false;$('start').disabled=true;$('folder').value=''}
function stop(reason='manual'){frame.contentWindow?.postMessage({type:'release-input'},location.origin);frame.removeAttribute('src');closeSession();journal.finish(reason);$('game-shell').hidden=true;$('launcher').hidden=false;state.world=false}
async function select(files){
 const entries=Array.from(files,file=>({path:file.webkitRelativePath,file}));
 stop();unmount();state.errors=[];state.requests=0;$('error').textContent='';if(!entries.length)return;
 if(!navigator.serviceWorker.controller){error('请先准备离线入口。');return}
 journal.begin('建立目录索引',{...environment(),files:entries.length});journal.checkpoint(null,{status:'indexing'},true);
 reader=new Worker(scoped('reader.js'));$('folder-status').textContent='正在建立目录索引并检查文件…';
 reader.onmessage=e=>{const m=e.data;
  if(m.type==='ready'){chosen=true;state.directoryReady=true;state.files=m.count;state.bytes=m.bytes;$('folder-status').textContent=m.count.toLocaleString()+' 个文件 · '+(m.bytes/1e9).toFixed(2)+' GB · 文件与大小检查通过，读取时校验 SHA-256';$('start').disabled=false;journal.checkpoint('目录检查完成',{status:'ready'},true)}
  if(m.type==='error'){error(m.error);$('folder-status').textContent='资源读取失败';$('start').disabled=true;frame.contentWindow?.postMessage({type:'release-input'},location.origin)}
  if(m.type==='stats')state.reader=m;
 };
 reader.onerror=e=>error('目录读取线程失败：'+e.message);
 reader.postMessage({type:'index',entries});
}
navigator.serviceWorker?.addEventListener('message',e=>{
 if(e.data?.type==='reconnect'&&chosen&&e.data.session===session)navigator.serviceWorker.controller?.postMessage({type:'mount',session});
 if(e.data?.type==='read'){
  if(e.data.session!==session||!reader||!chosen){e.ports[0]?.postMessage({type:'error',error:'目录授权已释放，请重新选择资源目录。'});return}
  state.requests=++requestNo;const request=e.data.request;journal.checkpoint(null,{lastRead:{path:request.path.slice(0,240),method:request.method,range:request.range,number:requestNo}});reader.postMessage({type:'request',request},[e.ports[0]]);
 }
});
$('prepare').onclick=prepare;$('choose').onclick=()=>$('folder').click();$('folder').onchange=e=>select(e.target.files);$('stop').onclick=()=>stop('manual');
$('start').onclick=()=>{
 if(!chosen)return;stop();session=crypto.randomUUID().replaceAll('-','');openChannels(session);$('error').textContent='';$('game-state').textContent='正在启动';state.world=false;state.fps=[];state.errors=[];state.startedAt=Date.now();
 journal.begin('启动引擎',environment());
 navigator.serviceWorker.controller.postMessage({type:'mount',session});
 const p=new URLSearchParams({mode:'story',low:'1',fps:'30',res:'960x540',fixed:'1',cores:'2',nocache:'1',args:'-uilanguage,chinese',touch:$('touch-enabled').checked?'1':'0'});
 frame.src=scoped('__game/'+session+'/')+'?'+p;$('launcher').hidden=true;$('game-shell').hidden=false;frame.focus();
};
function openChannels(id){for(const kind of ['game-progress','game-crash','game-fps','game-runtime']){const channel=new BroadcastChannel(kind+':'+id);channels.push(channel);channel.onmessage=e=>{
 if(!frame.hasAttribute('src'))return;
 if(kind==='game-progress'){state.progress=e.data;if(!state.world&&(e.data.label||Number.isFinite(e.data.pct)))journal.checkpoint(e.data.label,{...(Number.isFinite(e.data.pct)?{percent:Math.round(e.data.pct)}:{})});if(e.data.world){state.world=true;state.readyAt=Date.now();$('game-state').textContent='地图已加载 · 繁体中文';journal.checkpoint('地图已加载',{status:'running',percent:100},true)}else if(e.data.error){error(e.data.error);$('game-state').textContent='加载失败：'+e.data.error}else if(!state.world&&(e.data.label||Number.isFinite(e.data.pct)))$('game-state').textContent=(e.data.label||'正在加载')+(Number.isFinite(e.data.pct)?' '+Math.round(e.data.pct)+'%':'')}
 if(kind==='game-crash'){error(e.data.text||JSON.stringify(e.data));$('game-state').textContent='游戏已停止，请退出查看错误。'}
 if(kind==='game-fps'){state.fps.push(e.data.fps);if(state.fps.length>30)state.fps.shift();if(state.world){$('game-state').textContent='地图已加载 · '+Math.round(e.data.fps)+' FPS · 繁体中文';journal.checkpoint(null,{fps:e.data.fps})}}
 if(kind==='game-runtime'){state.runtime=e.data;if(e.data.type==='error')error(e.data.error);else if(e.data.type==='memory')journal.checkpoint(e.data.stage==='before'?'申请共享内存':'共享内存已创建',{memory:e.data.memory,runtime:{worker:e.data.worker,stage:e.data.stage}},true)}
}}}
for(const key of ['size','opacity','sensitivity','autoSprint']){
 const el=$(key),value=preferences()[key];if(el.type==='checkbox')el.checked=value;else el.value=value;
 el.oninput=()=>{const p=preferences();p[key]=el.type==='checkbox'?el.checked:Number(el.value);localStorage.setItem('playgta5.touch.settings',JSON.stringify(p));frame.contentWindow?.postMessage({type:'control-settings',settings:p},location.origin)};
}
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('gta5-userdata',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
const base64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s)};
async function exportSave(){const db=await database();try{const records=await new Promise((resolve,reject)=>{const records=[],r=db.transaction('files').objectStore('files').openCursor();r.onsuccess=()=>{const c=r.result;if(!c){resolve(records);return}if(String(c.key).startsWith('/userdata/'))records.push({path:c.key,mtime:c.value.mtime,data:base64(new Uint8Array(c.value.data))});c.continue()};r.onerror=()=>reject(r.error)});const blob=new Blob([JSON.stringify({format:'playgta5-userdata-v1',records})],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='local-save-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}finally{db.close()}}
async function importSave(file){if(frame.hasAttribute('src'))throw new Error('请先退出游戏再导入存档。');if(file.size>64*1024*1024)throw new Error('存档文件过大。');const value=JSON.parse(await file.text());if(value.format!=='playgta5-userdata-v1'||!Array.isArray(value.records)||value.records.length>1000)throw new Error('存档格式不正确。');const records=value.records.map(r=>{if(typeof r.path!=='string'||!r.path.startsWith('/userdata/')||r.path.includes('..')||typeof r.data!=='string'||!Number.isFinite(r.mtime))throw new Error('存档记录无效。');return {...r,bytes:Uint8Array.from(atob(r.data),c=>c.charCodeAt(0))}});const db=await database();try{await new Promise((resolve,reject)=>{const t=db.transaction('files','readwrite'),s=t.objectStore('files');for(const r of records)s.put({data:r.bytes,mtime:r.mtime},r.path);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error)})}finally{db.close()}$('folder-status').textContent='已导入 '+records.length+' 个存档／设置文件。'}
$('export-save').onclick=()=>exportSave().catch(error);$('import-save').onclick=()=>$('save-file').click();$('save-file').onchange=e=>{if(e.target.files[0])importSave(e.target.files[0]).catch(error)};
addEventListener('pagehide',()=>{stop('pagehide');unmount()});
addEventListener('pageshow',e=>{if(e.persisted){$('folder-status').textContent='请重新选择资源目录。';prepare()}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)frame.contentWindow?.postMessage({type:'release-input'},location.origin)});
async function copyDiagnostics(){const value=JSON.stringify({format:'folder-player-diagnostics-v1',environment:environment(),attempts:journal.snapshot(),pageErrors:state.errors},null,2);$('diagnostic-text').value=value;$('diagnostic-text').hidden=false;try{await navigator.clipboard.writeText(value);$('diagnostic-message').textContent='排查信息已复制，请粘贴发送给我。'}catch{$('diagnostic-text').focus();$('diagnostic-text').select();$('diagnostic-message').textContent='请长按下面的文字，全选后复制发送。'}}
$('copy-diagnostics').onclick=copyDiagnostics;
addEventListener('error',e=>error(e.error||e.message));addEventListener('unhandledrejection',e=>error(e.reason));
window.launcherDebug={select,stop,readerStats:()=>reader?.postMessage({type:'stats'}),cacheStatus:()=>rpc(navigator.serviceWorker.controller,{type:'status'}),diagnostics:()=>journal.snapshot(),state};
prepare();

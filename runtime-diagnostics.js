/* Local-only worker boundaries. No resource contents, uploads or memory-budget changes. */
(function(root){
 'use strict';
 if(root.__folderRuntimeDiagnostics)return;
 const id=root.location?.pathname.match(/\/__game\/([a-f0-9]{32})\//)?.[1];if(!id)return;
 root.__folderRuntimeDiagnostics=true;
 let errors=0;
 function send(value){try{const channel=new BroadcastChannel('game-runtime:'+id);channel.postMessage({...value,worker:root.name||root.location.pathname.split('/').pop()||'page'});channel.close()}catch{}}
 function fault(value){if(errors++<8)send({type:'error',error:String(value?.stack||value?.message||value||'unknown runtime error').slice(0,1000)})}
 root.addEventListener('error',e=>fault(e.error||e.message));
 root.addEventListener('unhandledrejection',e=>fault(e.reason));
 root.__folderRuntimeMemory=options=>{
  const memory={initialMiB:options.initial/16,maximumMiB:options.maximum/16,shared:!!options.shared};
  send({type:'memory',stage:'before',memory});
  try{const value=new WebAssembly.Memory(options);send({type:'memory',stage:'created',memory:{...memory,virtualBytes:value.buffer.byteLength}});return value}
  catch(error){fault(error);throw error}
 };
})(globalThis);

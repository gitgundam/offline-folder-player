/* Small local checkpoints survive when a renderer disappears without an error event. */
(function(root){
 'use strict';
 const ACTIVE=new Set(['indexing','loading','running']),KEY='folder-player.startup.v1';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const text=value=>String(value?.stack||value?.message||value||'').slice(0,1000);
 function create({storage,key=KEY,now=Date.now}={}){
  let saved={current:null,previous:null},owned=false,lastWrite=0,persistent=true;
  try{const value=JSON.parse(storage.getItem(key)||'null');if(value?.format===1)saved={current:value.current,previous:value.previous}}catch{persistent=false}
  function flush(force=false){
   const record=saved.current;if(!record)return;record.updatedAt=now();
   if(!force&&now()-lastWrite<1000)return;
   const last=record.events[record.events.length-1];
   if(!last||last.phase!==record.phase){record.events.push({at:now(),phase:record.phase,percent:record.percent});record.events=record.events.slice(-16)}
   try{storage.setItem(key,JSON.stringify({format:1,...saved}));lastWrite=now()}catch{persistent=false}
  }
  return {
   begin(phase,context={}){
    if(saved.current&&(ACTIVE.has(saved.current.status)||saved.current.status==='error'))saved.previous=clone(saved.current);
    saved.current={startedAt:now(),updatedAt:now(),status:'loading',phase:text(phase),context:clone(context),percent:null,errors:[],events:[]};owned=true;flush(true);
   },
   checkpoint(phase,details={},force=false){if(!owned)return;const record=saved.current;if(phase)record.phase=text(phase);for(const name of ['percent','status','lastRead','memory','runtime','fps'])if(details[name]!==undefined)record[name]=clone(details[name]);flush(force)},
   fault(error){if(!owned)return;saved.current.status='error';const message=text(error);if(!saved.current.errors.includes(message))saved.current.errors.push(message);saved.current.errors=saved.current.errors.slice(-6);flush(true)},
   finish(reason){if(!owned)return;if(saved.current.status!=='error')saved.current.status='stopped';saved.current.finishReason=reason;flush(true);owned=false},
   snapshot(){return clone({...saved,interrupted:!owned&&!!saved.current&&ACTIVE.has(saved.current.status),persistent})}
  };
 }
 root.StartupLog={create};if(typeof module!=='undefined')module.exports=root.StartupLog;
})(globalThis);

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../runtime-diagnostics.js'),'utf8');
test('the observer returns the native memory unchanged and records only scalar boundaries',()=>{
 const messages=[],handlers={},memory={buffer:{byteLength:3221225472}};
 const context={location:{pathname:'/offline-folder-player/__game/0123456789abcdef0123456789abcdef/b/build/game.js'},addEventListener:(kind,fn)=>handlers[kind]=fn,
  BroadcastChannel:class{constructor(name){this.name=name}postMessage(value){messages.push(value)}close(){}},WebAssembly:{Memory:class{constructor(options){assert.equal(options.initial,49152);return memory}}}};
 vm.runInNewContext(source,context);
 assert.equal(context.__folderRuntimeMemory({initial:49152,maximum:65535,shared:true}),memory);
 assert.equal(messages[0].stage,'before');assert.equal(messages[1].stage,'created');assert.equal(messages[1].memory.virtualBytes,3221225472);
 assert.equal(JSON.stringify(messages).includes('buffer'),false);
 const failure=new RangeError('memory denied');context.WebAssembly.Memory=class{constructor(){throw failure}};
 assert.throws(()=>context.__folderRuntimeMemory({initial:49152,maximum:65535,shared:true}),error=>error===failure);
 assert.match(messages.at(-1).error,/memory denied/);
 handlers.error({message:'worker failed'});assert.match(messages.at(-1).error,/worker failed/);
});

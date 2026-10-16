const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {adapt}=require('../runtime-paths.js');
const id='0123456789abcdef0123456789abcdef';
test('HTML uses scoped engine and cached control paths without changing resource names',()=>{
 const html='<title>Resource game</title><script src="/controls/input.js"></script><script src="__GAME_ROOT__/b/build/loader.js"></script>';
 const out=adapt('/',html,'/offline-folder-player/',id);
 assert.ok(out.includes('<title>本机资源运行</title>'));
 assert.ok(out.includes('"/offline-folder-player/controls/input.js"'));
 assert.ok(out.includes('"/offline-folder-player/__game/'+id+'/b/build/loader.js"'));
});
test('existing resource manifest lookup keeps the full root or repository prefix',()=>{
 const code=String.raw`self.location.origin+(self.location.pathname.match(/^\/__game\/[a-f0-9]{32}/)?.[0]||"")+"/data/manifest.json"`;
 for(const base of ['/','/offline-folder-player/']){
  const location={origin:'https://example.test',pathname:base+'__game/'+id+'/b/build/game.js'};
  const out=vm.runInNewContext(adapt('/b/build/game.js',code,base,id),{self:{location}});
  assert.equal(out,location.origin+base+'__game/'+id+'/data/manifest.json');
 }
});
test('channels stay scoped to the same session in both pages and native Workers',()=>{
 const code=String.raw`'game-progress'+':'+(globalThis.location.pathname.match(/^\/__game\/([a-f0-9]{32})\//)?.[1]||'unscoped')`;
 for(const suffix of ['/','/b/build/loader.js','/b/build/io_worker.js']){
  const out=vm.runInNewContext(adapt('/b/build/loader.js',code,'/offline-folder-player/',id),{location:{pathname:'/offline-folder-player/__game/'+id+suffix}});
  assert.equal(out,'game-progress:'+id);
 }
});
test('plain resource bytes and unrelated script text are unchanged',()=>{
 assert.equal(adapt('/data/test.bin','opaque','/offline-folder-player/',id),'opaque');
 assert.equal(adapt('/b/build/loader.js','const x=1','/',id),'const x=1');
 assert.throws(()=>adapt('/','x','/../../',id),/scope/);
});

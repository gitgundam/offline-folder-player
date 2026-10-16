/* Adapt verified resource scripts to a static host's repository subdirectory. */
(function(root){
 'use strict';
 function adapt(path,text,base,session){
  if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)||! /^[a-f0-9]{32}$/.test(session))throw new Error('Invalid runtime scope');
  if(path==='/'||path==='/index.html')return text
   .replaceAll('__GAME_ROOT__',base+'__game/'+session)
   .replace(/(["'])\/controls\//g,'$1'+base+'controls/')
   .replace(/<head>/i,'<head><script src="'+base+'runtime-diagnostics.js"></script>')
   .replace(/<title>[^<]*<\/title>/i,'<title>本机资源运行</title>');
  if(!path.endsWith('.js'))return text;
  text=text
   .replaceAll(String.raw`self.location.pathname.match(/^\/__game\/[a-f0-9]{32}/)`,String.raw`self.location.pathname.match(/^.*\/__game\/[a-f0-9]{32}/)`)
   .replaceAll(String.raw`globalThis.location.pathname.match(/^\/__game\/([a-f0-9]{32})\//)`,String.raw`globalThis.location.pathname.match(/\/__game\/([a-f0-9]{32})\//)`);
  if(!/^\/b\/[^/]+\/(loader|game|io_worker|wgpu_worker)\.js$/.test(path))return text;
  text=text.replaceAll('new WebAssembly.Memory({initial:INITIAL_MEMORY/65536,maximum:65535,shared:true})','globalThis.__folderRuntimeMemory({initial:INITIAL_MEMORY/65536,maximum:65535,shared:true})');
  const preamble="\nif(typeof importScripts==='function'&&!globalThis.__folderRuntimeDiagnostics)importScripts("+JSON.stringify(base+'runtime-diagnostics.js')+");\n";
  // Keep any leading strict directive active after inserting the worker observer.
  const directive=text.match(/^(\s*(?:(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*(?:'use strict'|"use strict");)/);
  return directive?directive[0]+preamble+text.slice(directive[0].length):preamble+text;
 }
 root.FolderRuntime={adapt};if(typeof module!=='undefined')module.exports=root.FolderRuntime;
})(globalThis);

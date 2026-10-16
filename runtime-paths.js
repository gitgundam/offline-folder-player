/* Adapt verified resource scripts to a static host's repository subdirectory. */
(function(root){
 'use strict';
 function adapt(path,text,base,session){
  if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)||! /^[a-f0-9]{32}$/.test(session))throw new Error('Invalid runtime scope');
  if(path==='/'||path==='/index.html')return text
   .replaceAll('__GAME_ROOT__',base+'__game/'+session)
   .replace(/(["'])\/controls\//g,'$1'+base+'controls/')
   .replace(/<title>[^<]*<\/title>/i,'<title>本机资源运行</title>');
  if(!path.endsWith('.js'))return text;
  return text
   .replaceAll(String.raw`self.location.pathname.match(/^\/__game\/[a-f0-9]{32}/)`,String.raw`self.location.pathname.match(/^.*\/__game\/[a-f0-9]{32}/)`)
   .replaceAll(String.raw`globalThis.location.pathname.match(/^\/__game\/([a-f0-9]{32})\//)`,String.raw`globalThis.location.pathname.match(/\/__game\/([a-f0-9]{32})\//)`);
 }
 root.FolderRuntime={adapt};if(typeof module!=='undefined')module.exports=root.FolderRuntime;
})(globalThis);

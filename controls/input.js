/* One owner of the engine input block. DOM adapters never synthesize key events. */
(function(root){
 'use strict';
 function direction(x=0,y=0,driving=false,autoSprint=false){
  const actions=new Set(),length=Math.hypot(x,y);if(length<=.18)return actions;
  if(driving){if(x<-.18)actions.add('KeyA');if(x>.18)actions.add('KeyD');return actions}
  const sector=(Math.round(Math.atan2(y,x)/(Math.PI/4))+8)%8;
  if([0,1,7].includes(sector))actions.add('KeyD');if([1,2,3].includes(sector))actions.add('KeyS');if([3,4,5].includes(sector))actions.add('KeyA');if([5,6,7].includes(sector))actions.add('KeyW');
  if(autoSprint&&length>=.9)actions.add('ShiftLeft');return actions;
 }
 function create({keys,w,VK}){
  const sources=new Map();let previous=new Set(),dx=0,dy=0,destroyed=false;
  function write(){const actions=new Set();let mouse=0;for(const s of sources.values()){for(const a of s.actions||[])actions.add(a);for(const a of direction(s.moveX,s.moveY,s.driving,s.autoSprint))actions.add(a);mouse|=s.mouse||0;if(actions.has('Fire'))mouse|=1;if(actions.has('Aim'))mouse|=2}
   for(const code of new Set([...previous,...actions]))if(VK[code]!==undefined)Atomics.store(keys,VK[code],actions.has(code)?128:0);previous=actions;Atomics.store(w,5,mouse);
  }
  const api={
   setSource(id,state={}){if(destroyed)return;const s={...state,actions:new Set(state.actions||[])};sources.set(id,s);dx+=Number.isFinite(s.lookX)?s.lookX:0;dy+=Number.isFinite(s.lookY)?s.lookY:0;write()},
   releaseSource(id){sources.delete(id);write()},
   releaseAll(){sources.clear();dx=dy=0;write();Atomics.store(w,2,0);Atomics.store(w,3,0)},
   flush(){if(destroyed)return;const x=Math.trunc(dx),y=Math.trunc(dy);dx-=x;dy-=y;if(x)Atomics.add(w,2,x);if(y)Atomics.add(w,3,y)},
   destroy(){api.releaseAll();destroyed=true},
   snapshot(){return {sources:[...sources.keys()],actions:[...previous],mouse:Atomics.load(w,5),pendingLook:[dx,dy]}}
  };return api;
 }
 function attach({memory,block,VK,canvas,width,height}){
  const keys=new Uint8Array(memory.buffer,block,256),w=new Int32Array(memory.buffer,block+256,10),text=new Uint16Array(memory.buffer,block+296,64),abort=new AbortController(),held=new Set();
  const input=create({keys,w,VK});let mouse=0,raf=0,last=0,padToggle=false,wheel=0,driving=false,touchMode=new URLSearchParams(location.search).get('touch')==='1';
  const on=(target,event,handler,options={})=>target.addEventListener(event,handler,{...options,signal:abort.signal});
  const overlay=e=>e.target instanceof Element&&!!e.target.closest('#mobile-controls');
  const aliases={KeyI:'Numpad8',KeyK:'Numpad2',KeyJ:'Numpad4',KeyL:'Numpad6',KeyU:'Numpad7',KeyO:'Numpad9'};
  const syncKeyboard=()=>{const all=new Set(held);for(const [from,to]of Object.entries(aliases))if(held.has(from))all.add(to);input.setSource('keyboard',{actions:all})};
  const textKey=value=>{const h=Atomics.load(w,8);if(((h-Atomics.load(w,9))>>>0)<64){text[h&63]=value;Atomics.store(w,8,(h+1)|0)}};
  const pass=e=>e.code==='F12'||e.code==='F11'||e.code==='F5'||e.metaKey||(e.ctrlKey&&e.shiftKey&&['KeyI','KeyJ'].includes(e.code));
  on(window,'keydown',e=>{if(pass(e))return;if(e.code==='F8'){e.preventDefault();if(!e.repeat)root.GameTouch?.toggle();return}if(!e.isTrusted)return;e.preventDefault();held.add(e.code);syncKeyboard();if(e.key.length===1&&!e.ctrlKey)textKey(e.key.charCodeAt(0));else if(['Backspace','Enter'].includes(e.code))textKey(e.code==='Enter'?13:8)});
  on(window,'keyup',e=>{if(pass(e))return;e.preventDefault();held.delete(e.code);syncKeyboard()});
  canvas.tabIndex=0;
  on(canvas,'mousedown',e=>{if(!e.isTrusted)return;canvas.focus({preventScroll:true});if(!touchMode&&!document.pointerLockElement){try{const p=canvas.requestPointerLock({unadjustedMovement:true});p?.catch(()=>canvas.requestPointerLock())}catch{canvas.requestPointerLock?.()}}mouse|=1<<[0,2,1,3,4][e.button];input.setSource('mouse',{mouse});e.preventDefault()});
  on(window,'mouseup',e=>{if(overlay(e))return;mouse&=~(1<<[0,2,1,3,4][e.button]);input.setSource('mouse',{mouse})});
  on(window,'contextmenu',e=>e.preventDefault());
  on(window,'mousemove',e=>{if(overlay(e)||!e.isTrusted||e.sourceCapabilities?.firesTouchEvents)return;const rect=canvas.getBoundingClientRect();let x,y,lx,ly;
   if(document.pointerLockElement===canvas){lx=e.movementX;ly=e.movementY;x=Atomics.load(w,0)+lx;y=Atomics.load(w,1)+ly}else{x=Math.round((e.clientX-rect.left)*width/rect.width);y=Math.round((e.clientY-rect.top)*height/rect.height);lx=x-Atomics.load(w,0);ly=y-Atomics.load(w,1)}
   Atomics.store(w,0,Math.max(0,Math.min(width-1,x)));Atomics.store(w,1,Math.max(0,Math.min(height-1,y)));input.setSource('mouse',{mouse,lookX:lx,lookY:ly});
  });
  on(window,'wheel',e=>{if(overlay(e))return;e.preventDefault();wheel+=-e.deltaY/(e.deltaMode===0?100:e.deltaMode===1?3:1);const n=Math.trunc(wheel);wheel-=n;Atomics.add(w,4,n)},{passive:false});
  const release=()=>{held.clear();mouse=0;input.releaseAll();root.GameTouch?.release();Atomics.store(w,6,0)};
  on(window,'blur',release);on(document,'visibilitychange',()=>{if(document.hidden)release()});on(window,'pagehide',()=>input.destroy());
  on(window,'message',e=>{if(e.origin!==location.origin)return;if(e.data?.type==='release-input')release();if(e.data?.type==='control-settings')root.GameTouch?.configure(e.data.settings)});
  on(window,'focus',()=>Atomics.store(w,6,1));
  Atomics.store(w,0,width>>1);Atomics.store(w,1,height>>1);Atomics.store(w,6,document.hasFocus()?1:0);
  function gamepad(dt){let pad;try{pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected&&p.mapping==='standard')}catch{}
   if(!pad||document.hidden||!document.hasFocus()){input.releaseSource('gamepad');return}
   if(root.GameTouch)driving=root.GameTouch.state.mode==='drive';
   const down=i=>pad.buttons[i]?.pressed||pad.buttons[i]?.value>.5,combo=down(8)&&down(9);if(combo&&!padToggle){driving=!driving;root.GameTouch?.mode(driving?'drive':'foot')}padToggle=combo;
   const actions=[];const map=driving?{0:'Space',1:'KeyR',2:'KeyQ',3:'KeyF',4:'Tab',5:'KeyH',8:'KeyV',9:'Escape',12:'ArrowUp',13:'ArrowDown',14:'ArrowLeft',15:'ArrowRight'}:{0:'ShiftLeft',1:'KeyR',2:'Space',3:'KeyF',4:'Tab',5:'KeyQ',8:'KeyV',9:'Escape',10:'ControlLeft',11:'KeyC',12:'ArrowUp',13:'ArrowDown',14:'ArrowLeft',15:'ArrowRight'};
   for(const [i,code]of Object.entries(map))if(down(+i)&&!(combo&&[8,9].includes(+i)))actions.push(code);
   if(driving){if(down(7))actions.push('KeyW');if(down(6))actions.push('KeyS')}else{if(down(7))actions.push('Fire');if(down(6))actions.push('Aim')}
   const axis=v=>Math.abs(v||0)<=.18?0:Math.sign(v)*(Math.abs(v)-.18)/.82;
   input.setSource('gamepad',{actions,moveX:pad.axes[0]||0,moveY:pad.axes[1]||0,driving,lookX:axis(pad.axes[2])*900*dt,lookY:axis(pad.axes[3])*900*dt});
  }
  function tick(now){const dt=Math.min(.05,Math.max(0,(now-(last||now))/1000));last=now;if(!document.hidden){gamepad(dt);input.flush();Atomics.store(w,6,document.hasFocus()?1:0);Atomics.store(w,7,document.pointerLockElement===canvas||touchMode?1:0)}raf=requestAnimationFrame(tick)}
  const destroy=input.destroy.bind(input);input.destroy=()=>{cancelAnimationFrame(raf);abort.abort();root.GameTouch?.destroy();destroy()};
  root.GameInputState={keys,w,input};if(touchMode)root.GameTouch.attach(input,canvas);raf=requestAnimationFrame(tick);return input;
 }
 root.GameInput={create,direction,attach};if(typeof module!=='undefined')module.exports=root.GameInput;
})(globalThis);

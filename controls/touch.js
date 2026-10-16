(function(root){
 'use strict';
 const defaults={size:1,opacity:.6,sensitivity:1,autoSprint:true};
 let input,canvas,element,stick,settings={...defaults},visible=true,currentMode='foot',lookOwner=null,aim=false,abort;
 const pointers=new Map(),owned=new Set();let joystickState=null;
 function source(id,state){owned.add(id);input.setSource(id,state)}
 function drop(id){owned.delete(id);input?.releaseSource(id)}
 function focus(){window.focus();canvas.focus({preventScroll:true})}
 function release(){for(const p of pointers.values())clearTimeout(p.timer);pointers.clear();for(const id of owned)input?.releaseSource(id);owned.clear();lookOwner=null;aim=false;joystickState=null;const button=element?.querySelector('[data-aim]');button?.setAttribute('aria-pressed','false');if(stick){const old=stick;stick=null;old.destroy();queueMicrotask(()=>{if(element&&visible&&!stick)joystick()})}}
 function move(e){const p=pointers.get(e.pointerId);if(!p)return;if(p.look){if(lookOwner===null)lookOwner=e.pointerId;if(lookOwner===e.pointerId)source(p.id,{actions:p.action?[p.action]:[],lookX:(e.clientX-p.x)*settings.sensitivity,lookY:(e.clientY-p.y)*settings.sensitivity})}p.x=e.clientX;p.y=e.clientY;e.preventDefault()}
 function up(e,cancel=false){const p=pointers.get(e.pointerId);if(!p)return;if(e.type==='lostpointercapture'&&p.up)return;p.up=true;if(lookOwner===e.pointerId)lookOwner=null;const delay=cancel||!p.pulse?0:Math.max(0,120-(performance.now()-p.started));if(delay)p.timer=setTimeout(()=>{drop(p.id);pointers.delete(e.pointerId)},delay);else{drop(p.id);pointers.delete(e.pointerId)}e.preventDefault()}
 function bind(node,action,{look=false,pulse=true,toggle=false}={}){
  node.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();focus();if(toggle){aim=!aim;node.setAttribute('aria-pressed',String(aim));if(aim)source('touch/aim',{actions:['Aim']});else drop('touch/aim');return}
   const old=pointers.get(e.pointerId);if(old){clearTimeout(old.timer);drop(old.id)}const id='touch/pointer/'+e.pointerId;
   const p={id,action,look,pulse,started:performance.now(),x:e.clientX,y:e.clientY,up:false};pointers.set(e.pointerId,p);node.setPointerCapture(e.pointerId);source(id,{actions:action?[action]:[]});if(look&&lookOwner===null)lookOwner=e.pointerId;
  },{signal:abort.signal});
  node.addEventListener('pointermove',move,{signal:abort.signal});node.addEventListener('pointerup',e=>up(e),{signal:abort.signal});node.addEventListener('pointercancel',e=>up(e,true),{signal:abort.signal});node.addEventListener('lostpointercapture',e=>up(e,e.type!=='pointerup'),{signal:abort.signal});
 }
 function button(label,action,options={}){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.action=action||'';b.setAttribute('aria-label',label);bind(b,action,options);return b}
 function mode(value){currentMode=value;if(!element)return;release();for(const box of element.querySelectorAll('[data-mode]'))box.hidden=box.dataset.mode!==value;element.querySelector('[data-switch]').textContent=value==='drive'?'驾驶':'徒步'}
 function joystick(){stick?.destroy();const zone=element.querySelector('#move-stick');stick=nipplejs.create({zone,mode:'static',position:{left:'50%',top:'50%'},size:120*settings.size,color:'#d9e9cb',restOpacity:1,threshold:0,fadeTime:80,dynamicPage:true});
  stick.on('start',()=>focus());stick.on('move',(_,data)=>{joystickState={moveX:data.vector.x,moveY:-data.vector.y,driving:currentMode==='drive',autoSprint:settings.autoSprint};source('touch/joystick',joystickState)});stick.on('end',()=>{joystickState=null;drop('touch/joystick')});
 }
 function configure(value){release();settings={...defaults,...value};settings.size=Math.max(.8,Math.min(1.5,Number(settings.size)||1));settings.opacity=Math.max(.2,Math.min(1,Number(settings.opacity)||.6));settings.sensitivity=Math.max(.2,Math.min(3,Number(settings.sensitivity)||1));if(element){element.style.setProperty('--control-size',settings.size);element.style.setProperty('--control-opacity',settings.opacity);joystick()}}
 function toggle(){if(!element)return;visible=!visible;release();element.classList.toggle('controls-hidden',!visible);element.querySelector('[data-hide]').textContent=visible?'隐藏':'显示按键'}
 function attach(router,target){input=router;canvas=target;abort=new AbortController();try{settings={...defaults,...JSON.parse(localStorage.getItem('playgta5.touch.settings')||'{}')}}catch{}
  element=document.createElement('section');element.id='mobile-controls';element.dataset.gameOverlay='';element.setAttribute('aria-label','游戏触屏控制');element.innerHTML='<div id="look-zone" aria-label="滑动转视角"></div><div id="move-stick" aria-label="移动摇杆"></div><nav id="touch-top"></nav><div id="foot-actions" class="action-panel" data-mode="foot"></div><div id="drive-actions" class="action-panel" data-mode="drive" hidden></div><div id="extra-actions" class="extra-panel" hidden></div><div id="menu-actions" class="menu-panel" hidden></div>';
  document.body.append(element);const top=element.querySelector('nav'),foot=element.querySelector('#foot-actions'),drive=element.querySelector('#drive-actions'),extra=element.querySelector('#extra-actions'),menu=element.querySelector('#menu-actions');
  function ui(label,handler,attribute){const b=document.createElement('button');b.textContent=label;b.type='button';if(attribute)b.setAttribute(attribute,'');b.addEventListener('click',()=>{focus();handler()},{signal:abort.signal});top.append(b);return b}
  ui('徒步',()=>mode(currentMode==='foot'?'drive':'foot'),'data-switch');ui('导航',()=>{release();menu.hidden=!menu.hidden;extra.hidden=true});const pause=button('暂停','Escape');top.append(pause);pause.addEventListener('pointerup',()=>{menu.hidden=false},{signal:abort.signal});ui('隐藏',toggle,'data-hide');
  const fire=button('射击','Fire',{look:true,pulse:false});fire.className='fire';foot.append(fire);const aiming=button('瞄准','Aim',{toggle:true});aiming.dataset.aim='';aiming.setAttribute('aria-pressed','false');aiming.className='aim';foot.append(aiming);
  for(const [label,action,className]of [['互动','KeyE','interact'],['跳跃','Space','jump'],['换弹','KeyR','reload'],['上车','KeyF','vehicle']]){const b=button(label,action);b.className=className;foot.append(b)}
  const more=document.createElement('button');more.textContent='更多';more.className='more';more.onclick=()=>{release();extra.hidden=!extra.hidden;menu.hidden=true};foot.append(more);
  for(const [label,action]of [['油门','KeyW'],['刹车／倒车','KeyS'],['手刹','Space'],['下车','KeyF']])drive.append(button(label,action,{pulse:action==='KeyF'}));
  for(const [label,action]of [['掩体','KeyQ'],['武器','Tab'],['镜头','KeyV']])extra.append(button(label,action));
  for(const [label,action]of [['↑','ArrowUp'],['↓','ArrowDown'],['←','ArrowLeft'],['→','ArrowRight'],['确定','Enter'],['返回','Backspace'],['上页签','KeyQ'],['下页签','KeyE'],['恢复','Escape']]){const b=button(label,action);menu.append(b);if(label==='恢复')b.addEventListener('pointerup',()=>{menu.hidden=true},{signal:abort.signal})}
  bind(element.querySelector('#look-zone'),null,{look:true,pulse:false});
  for(const type of ['mousedown','mouseup','contextmenu'])element.addEventListener(type,e=>{e.preventDefault();e.stopPropagation()},{capture:true,signal:abort.signal});
  for(const event of ['blur','orientationchange','resize'])window.addEventListener(event,release,{signal:abort.signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)release()},{signal:abort.signal});
  configure(settings);root.GameTouch.element=element;
 }
 function destroy(){release();stick?.destroy();abort?.abort();element?.remove();element=null;stick=null;input=null}
 root.GameTouch={attach,release,configure,mode,toggle,destroy,get state(){return {mode:currentMode,aim,pointers:pointers.size,lookOwner,joystick:joystickState,visible}}};
})(globalThis);

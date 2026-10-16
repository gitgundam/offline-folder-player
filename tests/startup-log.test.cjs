const {test}=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../startup-log.js');
function fixture(){const values=new Map();return {values,storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}}}
test('a new page recovers the last phase after an abrupt process loss',()=>{
 const {storage}=fixture();let clock=1000;
 const first=create({storage,now:()=>clock});
 first.begin('启动引擎',{build:'abc',files:12482});clock+=1200;
 first.checkpoint('编译引擎',{percent:20});
 const second=create({storage,now:()=>clock+100});
 assert.equal(second.snapshot().interrupted,true);
 assert.equal(second.snapshot().current.phase,'编译引擎');
 assert.equal(second.snapshot().current.percent,20);
 // A fresh page closing must not rewrite the recovered attempt as a clean exit.
 second.finish('pagehide');assert.equal(second.snapshot().interrupted,true);
 second.begin('启动引擎',{build:'abc'});
 assert.equal(second.snapshot().previous.phase,'编译引擎');
});
test('explicit exits and captured errors remain distinct from an unknown interruption',()=>{
 const {storage}=fixture();const a=create({storage});a.begin('启动引擎');a.finish('manual');
 assert.equal(create({storage}).snapshot().interrupted,false);
 const b=create({storage});b.begin('申请共享内存');b.fault(new Error('allocation failed'));b.finish('pagehide');
 const report=create({storage}).snapshot();assert.equal(report.current.status,'error');assert.match(report.current.errors[0],/allocation failed/);
});
test('progress writes are throttled and phase history and errors stay bounded',()=>{
 const f=fixture();let count=0,clock=1000;const original=f.storage.setItem;f.storage.setItem=(...args)=>{count++;original(...args)};
 const log=create({storage:f.storage,now:()=>clock});log.begin('启动');
 for(let i=0;i<1000;i++){clock++;log.checkpoint('读取 '+i,{percent:i%100})}
 assert.ok(count<=3);
 for(let i=0;i<100;i++){clock+=1200;log.checkpoint('阶段 '+i);log.fault('failure '+i)}
 const current=log.snapshot().current;assert.ok(current.events.length<=16);assert.ok(current.errors.length<=6);
 assert.ok([...f.values.values()][0].length<12000);
});
test('storage denial never prevents the engine from starting',()=>{
 const log=create({storage:{getItem(){throw new Error('denied')},setItem(){throw new Error('denied')}}});
 assert.doesNotThrow(()=>{log.begin('启动');log.checkpoint('编译',{percent:20});log.fault('failed')});
 assert.equal(log.snapshot().persistent,false);assert.equal(log.snapshot().current.phase,'编译');
});

const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function screen(overrides={}){
 const nodes=new Map(),writes=[],calls=[];
 const c={ME:{role:'owner'},hubT:(k,d,v)=>String(d).replace(/\{(\w+)\}/g,(m,k)=>v?.[k]??m),hubN:(k,d)=>d,esc:String,confirm:()=>true,render:()=>{},setTimeout:()=>0,clearTimeout:()=>{},document:{querySelectorAll:()=>[]},$:k=>{if(!nodes.has(k))nodes.set(k,{classList:{toggle:()=>{}}});return nodes.get(k);},sb:{from:()=>({upsert:async row=>{writes.push(row);return {};}}),rpc:async(name,args)=>{calls.push({name,args});return {data:[{month:'2026-09',person_key:'u',source_name:'합성',amount:100,confirmed:true,confirmed_at:'2026-10-10T00:30:00Z'}]};}},...overrides};
 // Supabase의 upsert(...).select()와 저장 행 응답을 재현한다.
 const from=c.sb.from;c.sb.from=(...args)=>{const q=from(...args);if(q.upsert){const write=q.upsert;q.upsert=(row,...options)=>({select:()=>Promise.resolve(write(row,...options)).then(r=>r.error||r.data?r:{data:[{...row,confirmed:false}]})});}return q;};
 vm.createContext(c);vm.runInContext(fs.readFileSync('payroll-bonus.js','utf8'),c);
 vm.runInContext("BONUS.month='2026-09';BONUS.people=[{person_key:'u',source_name:'합성'}];BONUS.entries=[{month:'2026-09',person_key:'u',source_name:'합성',amount:100,confirmed:true,confirmed_at:'2026-10-10T00:30:00Z'}]",c);
 return {c,nodes,writes,calls};
}
test('확정 표시와 줄·월 확정 버튼 및 확정 합계가 실제 패널에 연결됨',()=>{
 const {c}=screen();vm.runInContext("PAY_VIEW='bonus'",c);const html=c.bonusPanelHtml();
 assert.match(html,/저장\(확정\)/);assert.match(html,/이 달 전부 확정/);assert.match(html,/확정 합계/);assert.match(html,/미확정/);assert.match(html,/bonusConfirm\(0\)/);assert.match(html,/bonusConfirm\(\)/);
});
test('확정 뒤 입력은 즉시 미확정 표시·자동 저장에서는 확정 필드를 보내지 않음',async()=>{
 const {c,writes,nodes}=screen();c.bonusEdit(0,'amount','101');
 assert.equal(vm.runInContext("bonusEntry(BONUS.people[0]).confirmed",c),false);
 assert.match(nodes.get('#bonus-state-0').innerHTML,/미확정/);
 await c.bonusSave(0);assert.equal(writes.length,1);for(const k of ['confirmed','confirmed_at','confirmed_by'])assert.ok(!(k in writes[0]));
 assert.match(nodes.get('#bonus-state-0').innerHTML,/미확정/);
});
test('월 확정은 진행 중 저장과 다음 수정 저장을 마친 뒤 RPC를 호출하고 조작을 잠금',async()=>{
 let release;const events=[];const {c}=screen({sb:{from:()=>({upsert:row=>{events.push('save:'+row.amount);return new Promise(r=>release=r);}}),rpc:async(name,args)=>{events.push('confirm');assert.equal(args.p_month,'2026-09');assert.equal(args.p_person_keys,null);return {data:1};}}});
 c.bonusEdit(0,'amount','101');const saving=c.bonusSave(0);c.bonusEdit(0,'memo','다음 수정');
 const pending=c.bonusConfirm();await new Promise(r=>setImmediate(r));assert.deepEqual(events,['save:101']);
 c.bonusEdit(0,'amount','999');await c.bonusSetMonth('2026-10');assert.equal(vm.runInContext('BONUS.month',c),'2026-09');
 release({});await saving;await new Promise(r=>setImmediate(r));assert.deepEqual(events,['save:101','save:101']);release({});await pending;
 assert.deepEqual(events,['save:101','save:101','confirm']);assert.equal(vm.runInContext('BONUS.confirming',c),false);
});
test('저장 실패·확인 취소·직원 역할은 확정 RPC를 호출하지 않음',async()=>{
 let calls=0;const {c}=screen({sb:{from:()=>({upsert:async()=>({error:{message:'합성 실패'}})}),rpc:async()=>{calls++;return {};}}});
 c.bonusEdit(0,'amount','101');await c.bonusConfirm(0);assert.equal(calls,0);assert.equal(vm.runInContext('BONUS.confirming',c),false);
 c.confirm=()=>false;await c.bonusConfirm();assert.equal(calls,0);
 c.ME.role='staff';await c.bonusConfirm(0);assert.equal(calls,0);
});
test('같은 값으로 돌아온 입력은 DB가 보존한 확정 상태와 합계를 화면에 다시 반영',async()=>{
 const {c,nodes}=screen({sb:{from:()=>({upsert:async row=>({data:[{...row,confirmed:true,confirmed_at:'2026-10-10T00:30:00Z'}]})}),rpc:()=>{throw Error('확정 호출 없음');}}});
 c.bonusEdit(0,'amount','101');c.bonusEdit(0,'amount','100');await c.bonusSave(0);
 assert.equal(vm.runInContext('BONUS.entries[0].confirmed',c),true);assert.match(nodes.get('#bonus-state-0').innerHTML,/확정 09:30/);assert.match(nodes.get('#bonus-confirm-summary').textContent,/확정 합계 100/);
});
test('아직 상여 줄을 만들지 않은 직원은 미확정 건수에 세지 않음',()=>{
 const {c}=screen();vm.runInContext("BONUS.people.push({person_key:'empty',source_name:'미입력합성'})",c);
 assert.match(c.bonusConfirmationSummary(),/미확정 0건/);c.bonusEdit(1,'amount','0');assert.match(c.bonusConfirmationSummary(),/미확정 1건/);
});
module.exports={screen};

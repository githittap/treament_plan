// 통합 문의함 「처리」 칸 시험 — 처리 메모와 함께 처리됨으로 끝내기 · 처리한 사람 보이기 · 원장에게만 열람 기록 · 상세 칸이 눈앞에 보이기.
// 기존 tests/consultation-inbox.test.js 방식: hr.html에서 문의함 코드 조각을 떼어 가짜 sb로 실제 실행한다. 가짜 이름·번호만 쓴다.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const html=read('hr.html'),js=read('hub-texts.js');
const REGION=html.slice(html.indexOf('/* ── 상담일지:'),html.indexOf('/* ── 근로계약서 ── */'));
const FMT=html.match(/function formatLeaveTimestamp\(value\)\{[\s\S]*?\n\}/)[0];
const TIME=(html.match(/\/\* hub-time:test-start \*\/[\s\S]*?\/\* hub-time:test-end \*\//)||[''])[0]; // 허브 시간 표시 공통 함수(formatLeaveTimestamp가 부름)
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const PROFILES=[
  {user_id:'m1',name:'매니저가',role:'manager',active:true,approved:true},
  {user_id:'u2',name:'이매니저',role:'manager',active:true,approved:true},
  {user_id:'o1',name:'원장님',role:'owner',active:true,approved:true},
  {user_id:'u3',name:'박실장',role:'chief',active:true,approved:true},
  {user_id:'s1',name:'김직원',role:'staff',active:true,approved:true}
];
const row=(id,over)=>Object.assign({id,source:'phone',external_event_id:null,received_at:'2026-09-30T05:00:00Z',sender_name:'가짜'+id,contact:'01000000000',subject:'제목'+id,message:'내용'+id,status:'new',assigned_to:null,journal_id:null},over||{});
const ROWS=[
  row('a1',{received_at:'2026-09-30T05:00:00Z'}),
  row('b1',{received_at:'2026-09-30T04:00:00Z',status:'closed',assigned_to:'u2'}),
  row('c1',{received_at:'2026-09-30T03:00:00Z',status:'closed',assigned_to:'u2'}),
  row('d1',{received_at:'2026-09-30T02:00:00Z',status:'closed'})
];
const REPLIES=[{inbox_id:'b1',reply:'전화로 안내함 <끝>',created_at:'2026-09-30T06:00:00Z',author_id:'u3'}];
const VIEWS=[{inbox_id:'a1',viewer_id:'u2',viewed_at:'2026-09-30T05:10:00Z'},{inbox_id:'a1',viewer_id:'u3',viewed_at:'2026-09-30T05:20:00Z'},{inbox_id:'a1',viewer_id:'s1',viewed_at:'2026-09-30T05:30:00Z'},{inbox_id:'a1',viewer_id:'u2',viewed_at:'2026-09-30T05:40:00Z'}];

// 가짜 sb: 읽기·쓰기·rpc를 모두 기록한다. 표마다 정해진 결과를 돌려준다.
function makeSb(tables,log,over){
  const o=over||{};
  const from=table=>{
    const q={table,op:'select',cols:null,filters:[],payload:null};
    const api=new Proxy({},{get(_,k){
      if(k==='then')return (res,rej)=>{
        log.push(q);
        const spec=o.tables&&o.tables[table];
        const out=spec&&spec.error?{data:null,error:spec.error}:{data:q.op==='select'?(tables[table]||[]):null,error:null,count:0};
        return Promise.resolve(out).then(res,rej);
      };
      return (...a)=>{
        if(k==='select'){q.cols=a[0];}
        else if(k==='update'||k==='insert'||k==='upsert'||k==='delete'){q.op=k;q.payload=a[0];}
        else q.filters.push([k,...a]);
        return api;
      };
    }});
    return api;
  };
  return {from,rpc:(name,args)=>{log.push({rpc:name,args});const r=o.rpc&&o.rpc[name];return Promise.resolve(r||{data:null,error:null});}};
}
function makeDom(){
  const reg={};
  const el=sel=>reg[sel]||(reg[sel]={value:'',textContent:'',innerHTML:'',scrolled:[],onclick:null,
    scrollIntoView(arg){this.scrolled.push(arg);},querySelector(){return null;},querySelectorAll(){return [];},
    classList:{toggle(){},add(){},remove(){}},setAttribute(){},dataset:{}});
  return {$:el,reg};
}
function boot(role,over){
  const o=over||{},log=[],dom=makeDom(),statuses=[];
  const tables=Object.assign({consultation_inbox:ROWS,consultation_inbox_replies:REPLIES,consultation_inbox_views:VIEWS},o.tables||{});
  const md=s=>s?String(s).slice(5).replace('-','/'):'';
  const ctx={console,esc,md,$:dom.$,PROFILES,ME:{id:o.meId||'m1',name:'테스트',role},
    nameOf:uid=>{const p=PROFILES.find(x=>x.user_id===uid);return p?p.name:String(uid||'').slice(0,6);},
    setStatus:s=>statuses.push(s),alert:()=>{},confirm:()=>true,sb:makeSb(tables,log,o.sb)};
  vm.createContext(ctx);
  vm.runInContext(TIME+'\n'+FMT+'\n'+REGION+';0',ctx);
  return {ctx,log,dom,statuses};
}
const reads=(log,table)=>log.filter(q=>q.table===table&&q.op==='select');
const writes=log=>log.filter(q=>q.op&&q.op!=='select');
const calls=log=>log.map(q=>q.rpc?'rpc:'+q.rpc:(q.op==='select'?'read:'+q.table:q.op+':'+q.table));
const inFilter=q=>(q.filters.find(f=>f[0]==='in')||[])[2];

/* ───────────── ⓐ~ⓒ 처리 저장 ───────────── */
test('ⓐ 열린 묶음 「처리됨으로 저장」: 메모가 있으면 답변 기록(RPC)을 먼저 한 번, 그다음 처리 대상 전부 closed — 빈 담당만 지금 사람',async()=>{
  const t=boot('manager');
  t.ctx.inboxLoad=async()=>{t.log.push({rpc:'(목록 다시 읽기)'});};
  const rows=[row('x1',{status:'new',assigned_to:null}),row('x2',{status:'in_progress',assigned_to:'u2'}),row('x3',{status:'converted',journal_id:null}),row('x4',{status:'new',assigned_to:null,journal_id:'j9'})];
  const msg={textContent:''};
  const ok=await t.ctx.inboxMarkHandled(rows,'  전화로 안내함  ',msg);
  assert.equal(ok,true);
  const rpc=t.log.filter(q=>q.rpc&&q.rpc.startsWith('consultation_inbox_record_reply'));
  assert.equal(rpc.length,1,'답변 기록은 한 번');
  assert.deepEqual(JSON.parse(JSON.stringify(rpc[0].args)),{p_inbox_id:'x2',p_reply:'전화로 안내함'},'답 대상 = 처리 대상 중 마지막 줄, 메모는 앞뒤 공백 제거');
  const w=writes(t.log);
  assert.equal(w.length,2);
  assert.equal(t.log.indexOf(rpc[0])<t.log.indexOf(w[0]),true,'기록 먼저, 상태는 그 뒤');
  assert.deepEqual(JSON.parse(JSON.stringify(w[0].payload)),{status:'closed',assigned_to:'m1'});
  assert.deepEqual(w[0].filters.find(f=>f[0]==='in').slice(1),['id',['x1']],'담당이 빈 줄만 지금 사람으로');
  assert.deepEqual(JSON.parse(JSON.stringify(w[1].payload)),{status:'closed'},'이미 담당이 있는 줄은 담당 그대로');
  assert.deepEqual(w[1].filters.find(f=>f[0]==='in').slice(1),['id',['x2']]);
  assert.ok(t.log.some(q=>q.rpc==='(목록 다시 읽기)'),'성공하면 목록을 다시 읽음');
  assert.deepEqual(t.statuses,['saved']);
  assert.equal(msg.textContent,'');
});
test('ⓑ 메모가 없으면 답변 기록(RPC)을 부르지 않는다 — 공백뿐인 메모도 같음',async()=>{
  for(const memo of ['','   ',undefined]){
    const t=boot('manager');t.ctx.inboxLoad=async()=>{};
    assert.equal(await t.ctx.inboxMarkHandled([row('x1')],memo,{textContent:''}),true);
    assert.equal(t.log.filter(q=>q.rpc).length,0);
    assert.equal(writes(t.log).length,1);
  }
});
test('ⓒ 이미 담당이 있는 줄은 담당이 바뀌지 않는다(상태만 closed) · 처리 대상이 없거나 직원이면 아무것도 안 함',async()=>{
  const t=boot('manager');t.ctx.inboxLoad=async()=>{};
  await t.ctx.inboxMarkHandled([row('x1',{assigned_to:'u2'}),row('x2',{assigned_to:'u3'})],'메모',{textContent:''});
  const w=writes(t.log);
  assert.equal(w.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(w[0].payload)),{status:'closed'});
  assert.ok(!('assigned_to' in w[0].payload));
  const s=boot('staff');s.ctx.inboxLoad=async()=>{};
  assert.equal(await s.ctx.inboxMarkHandled([row('x1')],'메모',{textContent:''}),false);
  assert.equal(s.log.length,0,'직원은 쓰기를 시도조차 안 함');
  const n=boot('manager');n.ctx.inboxLoad=async()=>{};
  assert.equal(await n.ctx.inboxMarkHandled([row('y1',{status:'converted'}),row('y2',{journal_id:'j1'})],'메모',{textContent:''}),false);
  assert.equal(n.log.length,0);
});
test('처리 저장이 실패하면 입력칸 아래에 오류 글을 보이고 목록은 건드리지 않는다 · 메모는 두 번 기록하지 않는다',async()=>{
  const t=boot('manager',{sb:{rpc:{consultation_inbox_record_reply:{error:{message:'기록<실패>'}}}}});
  let loaded=0;t.ctx.inboxLoad=async()=>{loaded++;};
  const msg={textContent:''};
  assert.equal(await t.ctx.inboxMarkHandled([row('x1')],'메모',msg),false);
  assert.equal(msg.textContent,'처리 저장 실패: 기록<실패>');
  assert.equal(writes(t.log).length,0,'메모 기록이 실패하면 상태는 안 바꿈');assert.equal(loaded,0);
  // 상태 저장만 실패하는 경우: 다시 눌러도 같은 메모는 한 번만 기록
  const u=boot('manager',{sb:{tables:{consultation_inbox:{error:{message:'저장<실패>'}}}}});u.ctx.inboxLoad=async()=>{};
  const m2={textContent:''};
  assert.equal(await u.ctx.inboxMarkHandled([row('x1')],'메모',m2),false);
  assert.equal(m2.textContent,'처리 저장 실패: 저장<실패>');
  assert.equal(await u.ctx.inboxMarkHandled([row('x1')],'메모',m2),false);
  assert.equal(u.log.filter(q=>q.rpc==='consultation_inbox_record_reply').length,1);
});

/* ───────────── ⓓ 목록: 처리한 사람 ───────────── */
test('ⓓ 닫힌 묶음 칸: 처리한 사람(마지막 메모를 쓴 사람)·시각 + 메모 한 줄, 메모가 없으면 담당자, 둘 다 없으면 -',async()=>{
  const t=boot('manager');
  await t.ctx.inboxLoad();
  const list=t.dom.$('#inboxList').innerHTML;
  assert.match(list,/<th>처리<\/th>/);
  assert.ok(list.indexOf('<th>상태</th>')<list.indexOf('<th>처리</th>')&&list.indexOf('<th>처리</th>')<list.indexOf('<th>담당</th>'),'「처리」 칸은 「상태」 바로 옆');
  assert.match(list,/<div>✅ 박실장 · 2026\.9\.30 오후 3시<\/div><div class="inbox-handled-memo" title="전화로 안내함 &lt;끝&gt;">전화로 안내함 &lt;끝&gt;<\/div>/,'메모를 쓴 사람(박실장)·시각 + 메모');
  assert.match(list,/<div>✅ 이매니저<\/div>/,'메모가 없으면 담당자');
  assert.match(list,/<td><span class="b [^"]*">처리됨<\/span><\/td><td>-<\/td>/,'둘 다 없으면 처리 칸은 - 만');
  assert.doesNotMatch(list,/✅ -/);
  assert.match(list,/<button class="mini stamp" data-inbox-handle="a1">✅ 처리<\/button>/,'열린 묶음은 처리 단추');
  const mobile=list.slice(list.indexOf('inbox-mobile-list'));
  assert.match(mobile,/inbox-mobile-handled/,'모바일 카드에도 같은 내용');
  assert.match(mobile,/✅ 박실장 · 2026\.9\.30 오후 3시/);
  // 메모가 긴 경우 줄임 + 전체는 title
  const long='가'.repeat(60);
  const l=boot('manager',{tables:{consultation_inbox_replies:[{inbox_id:'b1',reply:long,created_at:'2026-09-30T06:00:00Z',author_id:'u3'}]}});
  await l.ctx.inboxLoad();
  assert.match(l.dom.$('#inboxList').innerHTML,new RegExp('title="'+long+'">'+'가'.repeat(40)+'…<'));
});
test('ⓓ-2 처리 메모를 읽는 요청은 목록에 보이는 묶음의 id를 한 번에(.in) 보내고, 읽기에 실패해도 목록은 그대로 그린다',async()=>{
  const t=boot('manager');
  await t.ctx.inboxLoad();
  const r=reads(t.log,'consultation_inbox_replies');
  assert.equal(r.length,1);
  assert.deepEqual([...inFilter(r[0])].sort(),['a1','b1','c1','d1']);
  const f=boot('manager',{sb:{tables:{consultation_inbox_replies:{error:{message:'x'}}}}});
  await f.ctx.inboxLoad();
  const list=f.dom.$('#inboxList').innerHTML;
  assert.match(list,/inbox-desktop-list/);assert.match(list,/<div>✅ 이매니저<\/div>/,'메모는 못 읽어도 담당자로 보임');
});

/* ───────────── ⓔ 직원 ───────────── */
test('ⓔ 직원(staff)은 「✅ 처리」 단추가 없고 처리 메모를 읽는 요청도 하지 않는다',async()=>{
  const t=boot('staff');
  await t.ctx.inboxLoad();
  const list=t.dom.$('#inboxList').innerHTML;
  assert.ok(!list.includes('data-inbox-handle'));
  assert.ok(!list.includes('✅ 처리'));
  assert.equal(reads(t.log,'consultation_inbox_replies').length,0);
  assert.equal(reads(t.log,'consultation_inbox_views').length,0);
  assert.match(list,/<div>✅ 이매니저<\/div>/,'닫힌 묶음의 담당자는 직원도 볼 수 있음');
});

/* ───────────── ⓕ 열람(원장만) ───────────── */
test('ⓕ 원장만 열람 칸이 있고 열람 기록(views)을 읽는다 — 서로 다른 열람자를 최근 순 2명 + 외 n명, 전체는 title · 매니저는 읽지 않음',async()=>{
  const o=boot('owner',{meId:'o1'});
  await o.ctx.inboxLoad();
  const list=o.dom.$('#inboxList').innerHTML;
  assert.match(list,/<th>열람<\/th>/);
  const v=reads(o.log,'consultation_inbox_views');
  assert.equal(v.length,1);assert.deepEqual([...inFilter(v[0])].sort(),['a1','b1','c1','d1']);
  // 최근 순: 이매니저(05:40) → 김직원(05:30) → 박실장(05:20). 이매니저는 두 번 열었어도 한 번만
  assert.match(list,/<td title="[^"]*">이매니저, 김직원 외 1명<\/td>/);
  assert.match(list,/title="이매니저 2026\.9\.30 오후 2시 40분\n김직원 2026\.9\.30 오후 2시 30분\n박실장 2026\.9\.30 오후 2시 20분"/);
  assert.match(list,/<td>-<\/td><td><button class="mini" data-inbox-ids="b1"/,'아무도 안 본 묶음은 -');
  assert.match(list.slice(list.indexOf('inbox-mobile-list')),/<div[^>]*>열람 이매니저, 김직원 외 1명<\/div>/,'모바일 카드에도 한 줄');
  const m=boot('manager');
  await m.ctx.inboxLoad();
  assert.ok(!m.dom.$('#inboxList').innerHTML.includes('<th>열람</th>'));
  assert.equal(reads(m.log,'consultation_inbox_views').length,0,'원장이 아니면 읽기 요청 자체를 하지 않음');
  const s=boot('staff');await s.ctx.inboxLoad();
  assert.equal(reads(s.log,'consultation_inbox_views').length,0);
});

/* ───────────── ⓖ 상세 ───────────── */
test('ⓖ 상세를 그린 뒤 상세 칸이 보이게 scrollIntoView를 부르고, 맨 위에 「↑ 목록으로」와 「✅ 처리 완료」 상자가 있다',async()=>{
  const t=boot('manager',{tables:{consultation_inbox:[ROWS[0]]}});
  await t.ctx.inboxSelect(['a1']);
  const el=t.dom.$('#inboxDetail');
  assert.deepEqual(JSON.parse(JSON.stringify(el.scrolled)),[{behavior:'smooth',block:'start'}]);
  const h=el.innerHTML;
  assert.ok(h.startsWith('<div class="rowflex" style="margin:0 0 8px"><button class="mini" onclick="inboxBackToList()">↑ 목록으로</button></div><div class="inbox-handle-detail">'),'맨 위: 목록으로 → 처리 완료 상자');
  assert.ok(h.indexOf('inboxHandleMemo')<h.indexOf('내용a1'),'처리 완료 상자는 문의 원문 위');
  assert.match(h,/onclick="inboxDetailHandle\(\)">처리됨으로 저장<\/button>/);
  assert.match(h,/placeholder="어떻게 처리했나요\?\(선택\)"/);
  // 「↑ 목록으로」는 목록 쪽으로 올라감
  t.ctx.inboxBackToList();
  assert.deepEqual(JSON.parse(JSON.stringify(t.dom.$('#inboxList').scrolled)),[{behavior:'smooth',block:'start'}]);
  // 직원: 목록으로는 있지만 처리 완료 상자는 없음 / 닫힌 묶음: 상자 없음
  const s=boot('staff',{tables:{consultation_inbox:[ROWS[0]]}});await s.ctx.inboxSelect(['a1']);
  assert.ok(s.dom.$('#inboxDetail').innerHTML.includes('inboxBackToList')&&!s.dom.$('#inboxDetail').innerHTML.includes('inboxHandleMemo'));
  const c=boot('manager',{tables:{consultation_inbox:[ROWS[1]]}});await c.ctx.inboxSelect(['b1']);
  assert.ok(!c.dom.$('#inboxDetail').innerHTML.includes('inboxHandleMemo'));
  // 카카오 예약 상세도 눈앞으로(내용은 그대로)
  const k=boot('manager',{tables:{consultation_inbox:[row('k1',{source:'kakao',external_event_id:'kbook-1',message:'예약 알림\n일정: 10/05 14:00'})]}});
  await k.ctx.inboxSelect(['k1']);
  assert.equal(k.dom.$('#inboxDetail').scrolled.length,1);assert.ok(!k.dom.$('#inboxDetail').innerHTML.includes('inboxBackToList'));
});
test('상세의 처리 완료 상자로 저장하면 상세 칸을 비우고 목록으로 돌아간다',async()=>{
  const t=boot('owner',{meId:'o1',tables:{consultation_inbox:[ROWS[0]]}});
  await t.ctx.inboxSelect(['a1']);
  t.dom.$('#inboxHandleMemo').value='상세에서 처리함';
  await t.ctx.inboxDetailHandle();
  assert.equal(t.dom.$('#inboxDetail').innerHTML,'처리됨으로 저장했습니다.');
  assert.equal(t.log.filter(q=>q.rpc==='consultation_inbox_record_reply').length,1);
  const w=writes(t.log);assert.deepEqual(JSON.parse(JSON.stringify(w[0].payload)),{status:'closed',assigned_to:'o1'});
  assert.ok(t.dom.$('#inboxList').scrolled.length>=1,'목록 쪽으로 돌아감');
});

/* ───────────── ⓗ 담당 미리 고르기 ───────────── */
test('ⓗ 묶음 담당이 비어 있으면 상세 담당 고르기에 지금 로그인한 사람이 미리 골라진다 — 이미 담당이 있으면 그대로, 후보에 없는 사람은 안 고름',async()=>{
  const t=boot('manager',{tables:{consultation_inbox:[ROWS[0]]}});
  await t.ctx.inboxSelect(['a1']);
  assert.match(t.dom.$('#inboxDetail').innerHTML,/<option value="m1" selected>매니저가 \(manager\)<\/option>/);
  assert.ok(!/<option value="" selected>/.test(t.dom.$('#inboxDetail').innerHTML));
  const a=boot('manager',{tables:{consultation_inbox:[row('z1',{assigned_to:'u2'})]}});await a.ctx.inboxSelect(['z1']);
  assert.match(a.dom.$('#inboxDetail').innerHTML,/<option value="u2" selected>/);assert.ok(!/<option value="m1" selected>/.test(a.dom.$('#inboxDetail').innerHTML));
  const x=boot('manager',{meId:'nobody',tables:{consultation_inbox:[ROWS[0]]}});await x.ctx.inboxSelect(['a1']);
  assert.ok(!/<option value="nobody"/.test(x.dom.$('#inboxDetail').innerHTML));
  assert.equal(x.ctx.inboxDefaultAssignee(null),null);assert.equal(x.ctx.inboxDefaultAssignee('u3'),'u3');
});
test('답변 기록 뒤 담당이 빈 처리 대상 줄은 지금 사람으로 채운다 · 상담일지 전환은 남은 줄의 빈 담당만 채우고 전환 흐름을 막지 않는다',async()=>{
  const t=boot('manager');t.ctx.inboxLoad=async()=>{};t.ctx.inboxLoadHistory=async()=>{};
  const sel={id:'x2',ids:['x1','x2'],processable:[row('x1',{assigned_to:null}),row('x2',{assigned_to:'u2'})]};
  vm.runInContext('INBOX_SELECTED=null;',t.ctx);t.ctx.__sel=sel;vm.runInContext('INBOX_SELECTED=__sel;',t.ctx);
  t.dom.$('#inboxReply').value='답';t.dom.$('#inboxReplyMsg');
  await t.ctx.inboxRecordReply();
  const w=writes(t.log);assert.equal(w.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(w[0].payload)),{assigned_to:'m1'});assert.deepEqual(w[0].filters.find(f=>f[0]==='in').slice(1),['id',['x1']]);
  // 전환
  const c=boot('manager');c.ctx.inboxLoad=async()=>{};
  const rows=[row('p1',{assigned_to:null}),row('p2',{assigned_to:'u2'}),row('p3',{assigned_to:null})];
  c.ctx.__sel={ids:['p1','p2','p3'],messages:rows};vm.runInContext('INBOX_SELECTED=__sel;',c.ctx);
  await c.ctx.inboxConvert();
  const cw=writes(c.log);
  assert.equal(c.log.filter(q=>q.rpc==='consultation_inbox_convert_to_journal').length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(c.log.find(q=>q.rpc==='consultation_inbox_convert_to_journal').args)),{p_inbox_id:'p3'},'전환된 줄(최근 줄)은 건드리지 않음');
  assert.deepEqual(JSON.parse(JSON.stringify(cw[0].payload)),{status:'closed'},'남은 줄 종결 update는 그대로');
  assert.deepEqual(JSON.parse(JSON.stringify(cw[1].payload)),{assigned_to:'m1'});assert.deepEqual(cw[1].filters.find(f=>f[0]==='in').slice(1),['id',['p1']]);
  // 담당 채우기가 실패해도 전환 성공 흐름은 그대로
  const f=boot('manager');f.ctx.inboxLoad=async()=>{};
  let nth=0;const realFrom=f.ctx.sb.from;
  f.ctx.sb.from=t2=>{const a=realFrom(t2);return new Proxy(a,{get(tg,k){if(k==='update')return p=>{const r=tg.update(p);if(p.assigned_to&&!p.status)return {in:()=>Promise.reject(new Error('채우기<실패>'))};return r;};return tg[k];}});};
  f.ctx.__sel={ids:['p1','p3'],messages:[row('p1'),row('p3')]};vm.runInContext('INBOX_SELECTED=__sel;',f.ctx);
  await f.ctx.inboxConvert();
  assert.deepEqual(f.statuses,['saved']);assert.equal(f.dom.$('#inboxDetail').innerHTML,'상담일지로 전환했습니다. 나머지 처리 대상 문의는 처리됨 상태로 보존했습니다.');
});

/* ───────────── 목록 단추 ───────────── */
test('목록의 「✅ 처리」를 누르면 그 줄에만 입력칸이 펼쳐지고(한 번에 한 줄) 「취소」로 접힌다 · 「처리됨으로 저장」은 그 묶음으로 처리 저장',async()=>{
  const rows=[row('a1'),row('a2',{received_at:'2026-09-30T04:00:00Z'})];
  const t=boot('manager',{tables:{consultation_inbox:rows}});
  await t.ctx.inboxLoad();
  const list=t.dom.$('#inboxList');
  const press=attrs=>list.onclick({target:{closest:()=>({dataset:attrs})}});
  press({inboxHandle:'a1'});
  assert.equal((list.innerHTML.match(/data-inbox-handle-save="a1"/g)||[]).length,2,'컴퓨터 표와 스마트폰 카드에 같은 입력칸');
  assert.ok(!list.innerHTML.includes('data-inbox-handle-save="a2"'));
  assert.ok(list.innerHTML.includes('data-inbox-handle="a2"'),'다른 줄은 아직 단추');
  press({inboxHandle:'a2'});
  assert.ok(list.innerHTML.includes('data-inbox-handle-save="a2"')&&!list.innerHTML.includes('data-inbox-handle-save="a1"'),'다른 줄을 누르면 앞의 줄은 접힘');
  press({inboxHandleCancel:'1'});
  assert.ok(!list.innerHTML.includes('data-inbox-handle-save'),'취소하면 접힘');
  assert.ok(!list.innerHTML.includes('<textarea'));
  // 저장 단추: 입력칸 안의 메모를 읽어 그 묶음으로 처리 저장
  press({inboxHandle:'a1'});
  const memo={value:'목록에서 처리'},msg={textContent:''};
  const btn={dataset:{inboxHandleSave:'a1'},disabled:false,closest:()=>({querySelector:q=>q.includes('memo')?memo:msg})};
  t.ctx.inboxLoad=async()=>{};
  await t.ctx.inboxListHandleSave(btn);
  assert.deepEqual(JSON.parse(JSON.stringify(t.log.filter(q=>q.rpc==='consultation_inbox_record_reply').map(q=>q.args))),[{p_inbox_id:'a1',p_reply:'목록에서 처리'}]);
  assert.deepEqual(JSON.parse(JSON.stringify(writes(t.log).map(q=>q.payload))),[{status:'closed',assigned_to:'m1'}]);
});

/* ───────────── ⓘ 글(허브 설정) ───────────── */
const NEW_KEYS={
  'inbox.th_handled':['처리',[]],'inbox.th_views':['열람',[]],'inbox.btn_handle':['✅ 처리',[]],
  'inbox.handled_line':['✅ {who} · {time}',['who','time']],'inbox.handled_by':['✅ {who}',['who']],'inbox.views_more':['외 {n}명',['n']],'inbox.m_views':['열람 {names}',['names']],
  'inbox.ph_handle_memo':['어떻게 처리했나요?(선택)',[]],'inbox.btn_handle_save':['처리됨으로 저장',[]],'inbox.btn_handle_cancel':['취소',[]],
  'inbox.d_handle_title':['✅ 처리 완료',[]],'inbox.btn_back':['↑ 목록으로',[]],'inbox.m_handle_fail':['처리 저장 실패: {msg}',['msg']],'inbox.m_handled':['처리됨으로 저장했습니다.',[]]
};
function hubHelpers(){
  const block=js.match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)[0];
  const c={};vm.createContext(c);vm.runInContext(block+';this.h={hubTextDefByKey,hubList,HUB_LIST_DEFS};',c);return c.h;
}
test('ⓘ 새로 보이는 글은 모두 inboxT(키, 기본 글)로 화면에 있고 hub-texts.js(허브 설정)에 같은 키·같은 기본 글·같은 자리표시자로 올라 있다',()=>{
  const h=hubHelpers();
  for(const [key,[def,vars]] of Object.entries(NEW_KEYS)){
    const d=h.hubTextDefByKey(key);
    assert.ok(d,key+' 허브 설정 목록에 있음');
    assert.equal(d.def,def,key+' 기본 글');
    assert.deepEqual([...(d.vars||[])].sort(),[...vars].sort(),key+' 자리표시자');
    assert.match(d.screen,/^📥 문의함/);
    const re=new RegExp("(?:inboxT\\(|th\\()'"+key.replace(/\./g,'\\.')+"',\\s*'((?:[^'\\\\\\n]|\\\\.)*)'");
    const m=html.match(re);assert.ok(m,key+' 화면에서 쓰임');assert.equal(vm.runInNewContext("'"+m[1]+"'"),def,key+' 화면 기본 글이 같음');
  }
});

/* ───────────── ⓙ 상태 이름 ───────────── */
test('ⓙ closed의 기본 이름이 「처리됨」이다(상태 배지·상태 고르는 칸·허브 설정 목록 기본값·건수 줄·풀이 글·전환 글) — 상태 코드와 다른 상태 이름은 그대로',()=>{
  const t=boot('manager');
  assert.deepEqual(JSON.parse(JSON.stringify(t.ctx.inboxStatusInfo('closed'))),{label:'처리됨',className:'mid'});
  assert.deepEqual(JSON.parse(JSON.stringify(t.ctx.inboxStatusInfo('new'))),{label:'NEW(미처리)',className:'no'});
  assert.equal(t.ctx.inboxStatusLabel('closed'),'처리됨');
  assert.equal(t.ctx.inboxStatusItems().find(i=>i.code==='closed').label,'처리됨');
  assert.match(t.ctx.inboxStatusSummary({new:1,in_progress:2,recall:3,closed:4,converted:5}),/ 처리됨 4 /);
  const h=hubHelpers();
  assert.equal(h.HUB_LIST_DEFS.find(d=>d.key==='list.inquiry_status').def.find(i=>i.code==='closed').label,'처리됨');
  assert.equal(h.hubTextDefByKey('inbox.sum_closed').def,'처리됨');
  assert.match(h.hubTextDefByKey('inbox.status_hint').def,/처리됨 = 담당자가 처리를 끝냄\(답변·예약·광고 정리 등\)$/);
  assert.match(h.hubTextDefByKey('inbox.m_converted').def,/처리됨 상태/);assert.match(h.hubTextDefByKey('inbox.m_convert_close_fail').def,/처리됨으로/);
  assert.ok(!/종결/.test(REGION.slice(REGION.indexOf('/* consultation-inbox:test-start */'),REGION.indexOf('const CONSULTATION_SHEETS'))),'문의함 코드 조각에 옛 이름 「종결」이 남지 않음');
  // 상태 고르는 칸(목록 맨 위): 값은 코드, 항목 글은 상태 이름 함수를 거침
  assert.match(t.ctx.inboxCardHtml(),/<option value="closed" >처리됨<\/option>/);
});

test('같은 사람의 문의가 한 묶음이면 목록에서 처리해도 답변 기록은 묶음의 가장 최근 줄에 남고, 묶음의 처리 대상 전부가 처리됨이 된다',async()=>{
  const rows=[row('g1',{sender_name:'같은사람',received_at:'2026-09-30T04:00:00Z'}),row('g2',{sender_name:'같은사람',received_at:'2026-09-30T04:10:00Z'}),row('g3',{sender_name:'같은사람',received_at:'2026-09-30T04:20:00Z',status:'converted'})];
  const t=boot('manager',{tables:{consultation_inbox:rows}});
  await t.ctx.inboxLoad();
  const list=t.dom.$('#inboxList');
  assert.ok(list.innerHTML.includes('data-inbox-handle="g3,g2,g1"'));
  list.onclick({target:{closest:()=>({dataset:{inboxHandle:'g3,g2,g1'}})}});
  const memo={value:'묶음 처리'},btn={dataset:{inboxHandleSave:'g3,g2,g1'},disabled:false,closest:()=>({querySelector:q=>q.includes('memo')?memo:{textContent:''}})};
  t.ctx.inboxLoad=async()=>{};
  await t.ctx.inboxListHandleSave(btn);
  assert.deepEqual(JSON.parse(JSON.stringify(t.log.filter(q=>q.rpc==='consultation_inbox_record_reply').map(q=>q.args))),[{p_inbox_id:'g2',p_reply:'묶음 처리'}],'전환된 줄(g3)은 빼고 남은 줄 중 가장 최근(g2)');
  const w=writes(t.log);
  assert.deepEqual([...w[0].filters.find(f=>f[0]==='in')[2]].sort(),['g1','g2']);
});

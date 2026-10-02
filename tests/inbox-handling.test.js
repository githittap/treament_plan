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
  row('b1',{received_at:'2026-09-30T04:00:00Z',status:'closed',assigned_to:'u2',handled_by:'u3',handled_at:'2026-09-30T06:00:00Z'}),
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
        const failed=o.failIf&&o.failIf(q);
        const pick=(r,cols)=>{if(table!=='consultation_inbox'||!cols||cols==='*'||!/,/.test(cols))return r;const keep=cols.split(',');return Object.fromEntries(Object.entries(r).filter(([k])=>keep.includes(k)));};
        const out=failed?{data:null,error:failed}:spec&&spec.error?{data:null,error:spec.error}:{data:q.op==='select'?(tables[table]||[]).map(r=>pick(r,q.cols)):null,error:null,count:0};
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
  return {from,rpc:(name,args)=>{log.push({rpc:name,args});const r=o.rpc&&o.rpc[name];return Promise.resolve((typeof r==='function'?r(args):r)||{data:null,error:null});}};
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

/* ───────────── ⓐ~ⓒ 처리 저장 — 순서: 상태 → 조건부 담당 → 메모 ───────────── */
const seq=log=>log.filter(q=>q.rpc?q.rpc.startsWith('consultation_inbox_record_reply'):q.op==='update').map(q=>q.rpc?'memo':(q.payload&&q.payload.status?'status':'assign'));
test('ⓐ 열린 묶음 「처리됨으로 저장」 순서: ①처리 대상 전부 상태 closed ②담당은 DB의 지금 값이 빈 줄만(.is assigned_to null) ③메모가 있으면 마지막에 답변 기록 한 번',async()=>{
  const t=boot('manager');
  t.ctx.inboxLoad=async()=>{t.log.push({rpc:'(목록 다시 읽기)'});};
  const rows=[row('x1',{status:'new',assigned_to:null}),row('x2',{status:'in_progress',assigned_to:'u2'}),row('x3',{status:'converted',journal_id:null}),row('x4',{status:'new',assigned_to:null,journal_id:'j9'})];
  const msg={textContent:''};
  const ok=await t.ctx.inboxMarkHandled(rows,'  전화로 안내함  ',msg);
  assert.equal(ok,true);
  assert.deepEqual(seq(t.log),['status','assign','memo'],'순서');
  const w=writes(t.log);
  assert.equal(w.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(w[0].payload)),{status:'closed'},'상태 update에는 담당·처리자 칸이 없음');
  assert.deepEqual([...w[0].filters.find(f=>f[0]==='in')[2]],['x1','x2'],'처리 대상 전부(전환된 줄·상담일지에 묶인 줄 제외)');
  assert.deepEqual(JSON.parse(JSON.stringify(w[1].payload)),{assigned_to:'m1'});
  assert.deepEqual([...w[1].filters.find(f=>f[0]==='in')[2]],['x1','x2'],'대상은 모두 보내되 DB가 빈 줄만 고름');
  assert.deepEqual(w[1].filters.find(f=>f[0]==='is').slice(1),['assigned_to',null],'화면에서 읽어 둔 값이 아니라 DB의 지금 값이 비어 있을 때만 담당을 채움');
  const rpc=t.log.filter(q=>q.rpc==='consultation_inbox_record_reply');
  assert.equal(rpc.length,1,'답변 기록은 한 번');
  assert.deepEqual(JSON.parse(JSON.stringify(rpc[0].args)),{p_inbox_id:'x2',p_reply:'전화로 안내함'},'답 대상 = 처리 대상 중 마지막 줄, 메모는 앞뒤 공백 제거');
  assert.ok(t.log.indexOf(rpc[0])>t.log.indexOf(w[1]),'메모는 마지막');
  assert.ok(t.log.some(q=>q.rpc==='(목록 다시 읽기)'),'성공하면 목록을 다시 읽음');
  assert.deepEqual(t.statuses,['saved']);
  assert.equal(msg.textContent,'');
  assert.ok(!REGION.includes('INBOX_MEMO_SAVED'),'옛 메모 중복 방지 장치(전역 INBOX_MEMO_SAVED)는 없어짐');
});
test('ⓑ 상태 저장이 실패하면 오류 글만 보이고 담당·메모는 아무것도 안 한다 · 메모가 없으면 답변 기록(RPC)을 부르지 않는다',async()=>{
  const t=boot('manager',{sb:{tables:{consultation_inbox:{error:{message:'저장<실패>'}}}}});
  let loaded=0;t.ctx.inboxLoad=async()=>{loaded++;};
  const msg={textContent:''};
  assert.equal(await t.ctx.inboxMarkHandled([row('x1')],'메모',msg),false);
  assert.equal(msg.textContent,'처리 저장 실패: 저장<실패>');
  assert.equal(t.log.filter(q=>q.rpc).length,0,'상태가 실패하면 메모 RPC를 부르지 않음');
  assert.equal(writes(t.log).length,1,'담당 update도 안 함');assert.equal(loaded,0);
  for(const memo of ['','   ',undefined]){
    const u=boot('manager');u.ctx.inboxLoad=async()=>{};
    assert.equal(await u.ctx.inboxMarkHandled([row('x1')],memo,{textContent:''}),true);
    assert.equal(u.log.filter(q=>q.rpc).length,0);
    assert.deepEqual(seq(u.log),['status','assign']);
  }
});
test('ⓒ 메모 저장만 실패하면 「다시 남겨 주세요」 글을 보이고 상태는 이미 처리됨 · 목록은 다시 그린다 · 상세에서 눌렀으면 상세 칸에도 그 글',async()=>{
  const fail={rpc:{consultation_inbox_record_reply:{error:{code:'P0001',message:'기록<실패>'}}}};
  const alerts=[];
  const t=boot('manager',{sb:fail});t.ctx.alert=m=>alerts.push(m);
  let loaded=0;t.ctx.inboxLoad=async()=>{loaded++;};
  const msg={textContent:''};
  assert.equal(await t.ctx.inboxMarkHandled([row('x1')],'메모',msg),true,'상태는 바뀌었으니 처리 자체는 성공');
  const text='처리됨으로 바꿨지만 메모는 저장하지 못했습니다: 기록<실패> — 상세에서 「답변 기록」으로 다시 남겨 주세요';
  assert.equal(msg.textContent,text);assert.deepEqual(alerts,[text]);
  assert.deepEqual(seq(t.log),['status','assign','memo']);assert.equal(loaded,1,'목록 다시 그림');
  const d=boot('manager',{sb:fail,tables:{consultation_inbox:[ROWS[0]]}});d.ctx.alert=()=>{};d.ctx.inboxLoad=async()=>{};
  await d.ctx.inboxSelect(['a1']);d.dom.$('#inboxHandleMemo').value='상세 메모';
  await d.ctx.inboxDetailHandle();
  assert.equal(d.dom.$('#inboxDetail').innerHTML,esc(text));
});
test('ⓓ B2 재현: 상태 저장이 실패한 시도에서는 메모를 남기지 않으므로, 나중에 다시 눌러 성공해도 메모는 정확히 한 번 · 처리된 뒤에는 처리 단추가 다시 안 나온다',async()=>{
  const tables={consultation_inbox:[row('r1',{sender_name:'재시도',status:'new'}),row('r2',{sender_name:'다른문의',status:'new',received_at:'2026-09-30T04:00:00Z'})]};
  const spec={error:{message:'저장<실패>'}};
  const t=boot('manager',{tables,sb:{tables:{consultation_inbox:spec}}});
  t.ctx.inboxLoad=async()=>{};
  const memos=()=>t.log.filter(q=>q.rpc==='consultation_inbox_record_reply').length;
  const rows=[tables.consultation_inbox[0]],msg={textContent:''};
  // 1) 상태 저장 실패 → 메모는 안 들어감(옛 순서에서는 메모가 먼저 들어가 있었음)
  assert.equal(await t.ctx.inboxMarkHandled(rows,'같은 메모',msg),false);assert.equal(memos(),0);
  // 2) 다른 문의를 먼저 처리한 뒤(새로고침과 같은 효과) 같은 메모로 다시 시도 → 이번엔 성공, 메모는 총 한 번
  spec.error=null;
  assert.equal(await t.ctx.inboxMarkHandled([tables.consultation_inbox[1]],'다른 메모',{textContent:''}),true);
  assert.equal(memos(),1);
  assert.equal(await t.ctx.inboxMarkHandled(rows,'같은 메모',msg),true);
  assert.deepEqual(JSON.parse(JSON.stringify(t.log.filter(q=>q.rpc==='consultation_inbox_record_reply').map(q=>q.args))),[{p_inbox_id:'r2',p_reply:'다른 메모'},{p_inbox_id:'r1',p_reply:'같은 메모'}],'같은 메모는 r1에 한 번만');
  // 3) 처리됨으로 읽히는 줄에는 처리 단추가 없다
  tables.consultation_inbox[0].status='closed';
  const u=boot('manager',{tables});await u.ctx.inboxLoad();
  assert.ok(!u.dom.$('#inboxList').innerHTML.includes('data-inbox-handle="r1"'));
});
test('ⓒ-2 이미 담당이 있는 줄은 담당 update 대상에서 DB가 거른다(화면은 담당을 덮어쓰는 값을 보내지 않음) · 처리 대상이 없거나 직원이면 아무것도 안 함',async()=>{
  const t=boot('manager');t.ctx.inboxLoad=async()=>{};
  await t.ctx.inboxMarkHandled([row('x1',{assigned_to:'u2'}),row('x2',{assigned_to:'u3'})],'메모',{textContent:''});
  const w=writes(t.log);
  assert.equal(w.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(w[0].payload)),{status:'closed'});
  assert.ok(w[1].filters.some(f=>f[0]==='is'&&f[1]==='assigned_to'&&f[2]===null),'조건부 update');
  const s=boot('staff');s.ctx.inboxLoad=async()=>{};
  assert.equal(await s.ctx.inboxMarkHandled([row('x1')],'메모',{textContent:''}),false);
  assert.equal(s.log.length,0,'직원은 쓰기를 시도조차 안 함');
  const n=boot('manager');n.ctx.inboxLoad=async()=>{};
  assert.equal(await n.ctx.inboxMarkHandled([row('y1',{status:'converted'}),row('y2',{journal_id:'j1'})],'메모',{textContent:''}),false);
  assert.equal(n.log.length,0);
});

/* ───────────── 목록: 처리한 사람 ───────────── */
test('ⓔ B3 재현: 처리한 사람·시각은 서버가 남긴 handled_by·handled_at — 박실장이 예전에 답변을 남긴 문의를 매니저가 메모 없이 처리하면 「✅ 매니저」, 예전 답변은 메모 줄로만',async()=>{
  const rows=[row('h1',{status:'closed',assigned_to:'u2',received_at:'2026-09-30T05:00:00Z',handled_by:'m1',handled_at:'2026-10-01T01:30:00Z'})];
  const t=boot('manager',{tables:{consultation_inbox:rows,consultation_inbox_replies:[{inbox_id:'h1',reply:'예전 답변',created_at:'2026-09-30T06:00:00Z',author_id:'u3'}]}});
  await t.ctx.inboxLoad();
  const list=t.dom.$('#inboxList').innerHTML;
  assert.match(list,/<div>✅ 매니저가 · 2026\.10\.1 오전 10시 30분<\/div>/,'처리자 = handled_by, 시각 = handled_at');
  assert.doesNotMatch(list,/✅ 박실장/,'답변 작성자를 처리자로 보이지 않음');
  assert.match(list,/<div class="inbox-handled-memo" title="박실장 · 2026\.9\.30 오후 3시\n예전 답변">예전 답변<\/div>/,'메모 줄 title에 작성자·시각과 전문');
  // 묶음에 처리된 줄이 여럿이면 handled_at이 가장 늦은 줄
  const g=[row('g1',{sender_name:'같은사람',status:'closed',received_at:'2026-09-30T04:00:00Z',handled_by:'u2',handled_at:'2026-10-01T01:00:00Z'}),row('g2',{sender_name:'같은사람',status:'closed',received_at:'2026-09-30T04:10:00Z',handled_by:'o1',handled_at:'2026-10-01T02:00:00Z'})];
  const u=boot('manager',{tables:{consultation_inbox:g,consultation_inbox_replies:[]}});await u.ctx.inboxLoad();
  assert.match(u.dom.$('#inboxList').innerHTML,/<div>✅ 원장님 · 2026\.10\.1 오전 11시<\/div>/);
});
test('ⓕ handled_at이 없는 옛 처리됨 줄은 처리자·시각을 지어내지 않는다 — 메모도 없으면 -, 메모만 있으면 메모만(담당자·답변 작성자를 처리자로 쓰지 않음)',async()=>{
  const rows=[row('o1x',{status:'closed',assigned_to:'u2',received_at:'2026-09-30T05:00:00Z'}),row('o2x',{status:'closed',assigned_to:'u2',received_at:'2026-09-30T04:00:00Z'})];
  const t=boot('manager',{tables:{consultation_inbox:rows,consultation_inbox_replies:[{inbox_id:'o2x',reply:'옛 메모',created_at:'2026-09-29T06:00:00Z',author_id:'u3'}]}});
  await t.ctx.inboxLoad();
  const list=t.dom.$('#inboxList').innerHTML;
  assert.doesNotMatch(list,/✅/,'처리한 사람 줄 없음');
  assert.match(list,/<td><span class="b [^"]*">처리됨<\/span><\/td><td>-<\/td>/,'메모도 없으면 -');
  assert.match(list,/<td><div class="inbox-handled-memo" title="박실장 · 2026\.9\.29 오후 3시\n옛 메모">옛 메모<\/div><\/td>/,'메모만 있으면 메모만');
});
test('ⓓ 처리 메모(마지막 답변 글)는 한 줄로 줄이고 전체는 title · 모바일 카드에도 같은 내용',async()=>{
  const t=boot('manager');
  await t.ctx.inboxLoad();
  const list=t.dom.$('#inboxList').innerHTML;
  assert.match(list,/<th>처리<\/th>/);
  assert.ok(list.indexOf('<th>상태</th>')<list.indexOf('<th>처리</th>')&&list.indexOf('<th>처리</th>')<list.indexOf('<th>담당</th>'),'「처리」 칸은 「상태」 바로 옆');
  assert.match(list,/<div>✅ 박실장 · 2026\.9\.30 오후 3시<\/div><div class="inbox-handled-memo" title="박실장 · 2026\.9\.30 오후 3시\n전화로 안내함 &lt;끝&gt;">전화로 안내함 &lt;끝&gt;<\/div>/);
  assert.match(list,/<td><span class="b [^"]*">처리됨<\/span><\/td><td>-<\/td>/,'기록이 없는 옛 처리됨은 처리 칸 -');
  assert.match(list,/<button class="mini stamp" data-inbox-handle="a1">✅ 처리<\/button>/,'열린 묶음은 처리 단추');
  const mobile=list.slice(list.indexOf('inbox-mobile-list'));
  assert.match(mobile,/inbox-mobile-handled/);assert.match(mobile,/✅ 박실장 · 2026\.9\.30 오후 3시/);
  const long='가'.repeat(60);
  const l=boot('manager',{tables:{consultation_inbox_replies:[{inbox_id:'b1',reply:long,created_at:'2026-09-30T06:00:00Z',author_id:'u3'}]}});
  await l.ctx.inboxLoad();
  assert.match(l.dom.$('#inboxList').innerHTML,new RegExp('title="박실장 · [^"]*\\n'+long+'">'+'가'.repeat(40)+'…<'));
});
test('ⓓ-2 처리 메모를 읽는 요청은 목록에 보이는 묶음의 id를 한 번에(.in) 보내고, 읽기에 실패해도 목록은 그대로 그린다(처리한 사람은 목록 줄에서 옴)',async()=>{
  const t=boot('manager');
  await t.ctx.inboxLoad();
  const r=reads(t.log,'consultation_inbox_replies');
  assert.equal(r.length,1);
  assert.deepEqual([...inFilter(r[0])].sort(),['a1','b1','c1','d1']);
  const f=boot('manager',{sb:{tables:{consultation_inbox_replies:{error:{message:'x'}}}}});
  await f.ctx.inboxLoad();
  const list=f.dom.$('#inboxList').innerHTML;
  assert.match(list,/inbox-desktop-list/);assert.match(list,/<div>✅ 박실장 · 2026\.9\.30 오후 3시<\/div>/,'메모는 못 읽어도 처리자는 보임');
});
test('ⓖ 목록 읽기: handled_by·handled_at도 읽고, 그 칸이 DB에 아직 없으면(올리기 전·되돌린 뒤) 빼고 다시 읽어 목록을 그대로 그린다',async()=>{
  const t=boot('manager');
  await t.ctx.inboxLoad();
  const first=reads(t.log,'consultation_inbox');
  assert.match(first[0].cols,/handled_by,handled_at/);assert.match(first[0].cols,/dentweb_entered_at/);
  const noHandled=boot('manager',{sb:{failIf:q=>q.table==='consultation_inbox'&&q.op==='select'&&/handled_by/.test(q.cols||'')?{code:'42703',message:'column consultation_inbox.handled_by does not exist'}:null}});
  await noHandled.ctx.inboxLoad();
  const rs=reads(noHandled.log,'consultation_inbox').map(q=>q.cols);
  assert.equal(rs.length>=2,true);assert.match(rs[0],/handled_by/);assert.doesNotMatch(rs[1],/handled_by/);assert.match(rs[1],/dentweb_entered_at/,'덴트웹 칸은 그대로 읽음');
  const list=noHandled.dom.$('#inboxList').innerHTML;
  assert.match(list,/inbox-desktop-list/);assert.doesNotMatch(list,/cal-error/);
  assert.doesNotMatch(list,/✅ 박실장/,'처리자 칸이 없으면 처리한 사람은 안 보임');
  // 두 칸 다 없는 옛 DB
  const old=boot('manager',{sb:{failIf:q=>q.table==='consultation_inbox'&&q.op==='select'&&/handled_by|dentweb_entered_at/.test(q.cols||'')?{code:'PGRST204',message:'Could not find the column in the schema cache'}:null}});
  await old.ctx.inboxLoad();
  assert.match(old.dom.$('#inboxList').innerHTML,/inbox-desktop-list/);
  assert.doesNotMatch(reads(old.log,'consultation_inbox').pop().cols,/handled_by|dentweb/);
});
test('상태·담당 저장과 상담일지 전환은 처리 칸(handled_*)을 보내지 않는다 — 처리한 사람은 DB 트리거가 남김',async()=>{
  const t=boot('manager');t.ctx.inboxLoad=async()=>{};
  t.ctx.__sel={ids:['p1','p2'],messages:[row('p1'),row('p2')]};vm.runInContext('INBOX_SELECTED=__sel;',t.ctx);
  t.dom.$('#inboxAssigned').value='u2';t.dom.$('#inboxStatus').value='closed';
  await t.ctx.inboxSave();
  await t.ctx.inboxConvert();
  const w=writes(t.log);assert.ok(w.length>=2);
  for(const q of w)assert.ok(!('handled_by' in q.payload)&&!('handled_at' in q.payload),JSON.stringify(q.payload));
  assert.deepEqual(JSON.parse(JSON.stringify(w[0].payload)),{status:'closed',assigned_to:'u2'});
  assert.ok(!/handled_(by|at)\s*:/.test(REGION.replace(/handled_by,handled_at/g,'')),'화면 코드가 handled_* 값을 써 넣지 않음');
});

/* ───────────── 직원 ───────────── */
test('ⓗ 직원(staff)은 「✅ 처리」 단추가 없고 처리 메모를 읽는 요청도 하지 않는다',async()=>{
  const t=boot('staff');
  await t.ctx.inboxLoad();
  const list=t.dom.$('#inboxList').innerHTML;
  assert.ok(!list.includes('data-inbox-handle'));
  assert.ok(!list.includes('✅ 처리'));
  assert.equal(reads(t.log,'consultation_inbox_replies').length,0);
  assert.equal(reads(t.log,'consultation_inbox_views').length,0);
  assert.match(list,/<div>✅ 박실장 · 2026\.9\.30 오후 3시<\/div>/,'처리한 사람·시각은 직원도 볼 수 있음');
  assert.ok(!list.includes('inbox-handled-memo'),'처리 메모는 직원에게 안 보임(읽지 않음)');
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
  const w=writes(t.log);assert.deepEqual(JSON.parse(JSON.stringify(w[0].payload)),{status:'closed'});assert.deepEqual(JSON.parse(JSON.stringify(w[1].payload)),{assigned_to:'o1'});
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
  assert.deepEqual(JSON.parse(JSON.stringify(w[0].payload)),{assigned_to:'m1'});assert.deepEqual(w[0].filters.find(f=>f[0]==='in').slice(1),['id',['x1']]);assert.deepEqual(w[0].filters.find(f=>f[0]==='is').slice(1),['assigned_to',null],'답변 기록 뒤 담당 채우기도 DB의 지금 값이 빈 줄만');
  // 전환
  const c=boot('manager');c.ctx.inboxLoad=async()=>{};
  const rows=[row('p1',{assigned_to:null}),row('p2',{assigned_to:'u2'}),row('p3',{assigned_to:null})];
  c.ctx.__sel={ids:['p1','p2','p3'],messages:rows};vm.runInContext('INBOX_SELECTED=__sel;',c.ctx);
  await c.ctx.inboxConvert();
  const cw=writes(c.log);
  assert.equal(c.log.filter(q=>q.rpc==='consultation_inbox_convert_to_journal').length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(c.log.find(q=>q.rpc==='consultation_inbox_convert_to_journal').args)),{p_inbox_id:'p3'},'전환된 줄(최근 줄)은 건드리지 않음');
  assert.deepEqual(JSON.parse(JSON.stringify(cw[0].payload)),{status:'closed'},'남은 줄 종결 update는 그대로');
  assert.deepEqual(JSON.parse(JSON.stringify(cw[1].payload)),{assigned_to:'m1'});assert.deepEqual(cw[1].filters.find(f=>f[0]==='in').slice(1),['id',['p1']]);assert.deepEqual(cw[1].filters.find(f=>f[0]==='is').slice(1),['assigned_to',null]);
  // 담당 채우기가 실패해도 전환 성공 흐름은 그대로
  const f=boot('manager');f.ctx.inboxLoad=async()=>{};
  let nth=0;const realFrom=f.ctx.sb.from;
  f.ctx.sb.from=t2=>{const a=realFrom(t2);return new Proxy(a,{get(tg,k){if(k==='update')return p=>{const r=tg.update(p);if(p.assigned_to&&!p.status)return {in:()=>({is:()=>Promise.reject(new Error('채우기<실패>'))})};return r;};return tg[k];}});};
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
  assert.deepEqual(JSON.parse(JSON.stringify(writes(t.log).map(q=>q.payload))),[{status:'closed'},{assigned_to:'m1'}]);
});

/* ───────────── ⓘ 글(허브 설정) ───────────── */
const NEW_KEYS={
  'inbox.th_handled':['처리',[]],'inbox.th_views':['열람',[]],'inbox.btn_handle':['✅ 처리',[]],
  'inbox.handled_line':['✅ {who} · {time}',['who','time']],'inbox.m_handle_memo_fail':['처리됨으로 바꿨지만 메모는 저장하지 못했습니다: {msg} — 상세에서 「답변 기록」으로 다시 남겨 주세요',['msg']],'inbox.views_more':['외 {n}명',['n']],'inbox.m_views':['열람 {names}',['names']],
  'inbox.ph_handle_memo':['어떻게 처리했나요?(선택)',[]],'inbox.btn_handle_save':['처리됨으로 저장',[]],'inbox.btn_handle_cancel':['취소',[]],
  'inbox.d_handle_title':['✅ 처리 완료',[]],'inbox.btn_back':['↑ 목록으로',[]],'inbox.m_handle_fail':['처리 저장 실패: {msg}',['msg']],'inbox.m_handled':['처리됨으로 저장했습니다.',[]],'inbox.m_memo_unknown':['처리됨으로 바꿨지만 메모가 저장됐는지 확인하지 못했습니다: {msg} — 문의함을 새로 열어 메모가 없을 때만 상세에서 다시 남겨 주세요',['msg']],'inbox.m_reply_unknown':['답변이 기록됐는지 확인하지 못했습니다: {msg} — 문의를 다시 열어 아래 답변 이력에 없을 때만 다시 눌러 주세요',['msg']]
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

/* ───────────── 메모·답변 기록 결과 판정: 오류 번호로 가림(개수 짐작 없음) ───────────── */
const MEMO_FAIL='처리됨으로 바꿨지만 메모는 저장하지 못했습니다: 기록<실패> — 상세에서 「답변 기록」으로 다시 남겨 주세요';
const MEMO_UNKNOWN='처리됨으로 바꿨지만 메모가 저장됐는지 확인하지 못했습니다: 기록<실패> — 문의함을 새로 열어 메모가 없을 때만 상세에서 다시 남겨 주세요';
const REPLY_UNKNOWN='답변이 기록됐는지 확인하지 못했습니다: 기록<실패> — 문의를 다시 열어 아래 답변 이력에 없을 때만 다시 눌러 주세요';
// 메모 RPC가 오류를 돌려주는 가짜 sb(error에 code가 있으면 서버의 DB 오류, 없으면 응답이 끊긴 경우). store.saved = 서버에 실제로 들어간 같은 글 수
function errSb(error,opts){
  const o=opts||{},store={saved:0,rpcCalls:0};
  return {store,sb:{rpc:{consultation_inbox_record_reply:()=>{store.rpcCalls++;if(o.savedOnServer)store.saved++;return {error};}}}};
}
const E_DB={code:'P0001',message:'기록<실패>'},E_NET={message:'기록<실패>'};
const handleOnce=async(opts)=>{
  const {store,sb}=errSb(opts.error,opts);const t=boot('manager',{sb});const alerts=[];t.ctx.alert=m=>alerts.push(m);t.ctx.inboxLoad=async()=>{};
  const msg={textContent:''};const ok=await t.ctx.inboxMarkHandled([row('x1')],'메모',msg);
  return {t,store,alerts,msg,ok};
};
test('ⓐ 처리 메모 RPC가 DB 오류 번호(P0001)를 돌려주면 확실히 안 들어간 것 — 「저장하지 못했습니다」',async()=>{
  const r=await handleOnce({error:E_DB});
  assert.equal(r.ok,true,'상태는 이미 처리됨');
  assert.equal(r.msg.textContent,MEMO_FAIL);assert.deepEqual(r.alerts,[MEMO_FAIL]);
});
test('ⓑ 번호 없는 오류(인터넷 끊김·시간 초과)는 「확인하지 못했습니다」(inbox.m_memo_unknown) — 저장 여부를 단정하지 않는다 · 상세에서 눌렀으면 상세 칸에도 그 글',async()=>{
  const r=await handleOnce({error:E_NET});
  assert.equal(r.msg.textContent,MEMO_UNKNOWN);assert.deepEqual(r.alerts,[MEMO_UNKNOWN]);
  assert.ok(!r.msg.textContent.includes('저장하지 못했습니다'),'저장 못 했다고 단정하지 않음');
  const {sb}=errSb(E_NET);
  const d=boot('manager',{sb,tables:{consultation_inbox:[ROWS[0]]}});d.ctx.alert=()=>{};d.ctx.inboxLoad=async()=>{};
  await d.ctx.inboxSelect(['a1']);d.dom.$('#inboxHandleMemo').value='상세 메모';await d.ctx.inboxDetailHandle();
  assert.equal(d.dom.$('#inboxDetail').innerHTML,esc(MEMO_UNKNOWN));
});
test('ⓒ 메모 RPC는 한 번만 부르고, 저장 여부를 알아보려고 replies를 세거나 읽는 요청은 하지 않는다(개수 짐작 없음)',async()=>{
  for(const error of [E_DB,E_NET,null]){
    const {store,sb}=errSb(error);if(!error)sb.rpc.consultation_inbox_record_reply=()=>{store.rpcCalls++;return {error:null};};
    const t=boot('manager',{sb});t.ctx.alert=()=>{};t.ctx.inboxLoad=async()=>{};
    await t.ctx.inboxMarkHandled([row('x1')],'메모',{textContent:''});
    assert.equal(store.rpcCalls,1);
    assert.equal(reads(t.log,'consultation_inbox_replies').length,0,'replies 읽기·count 요청 없음');
  }
});
test('ⓓ Astra 2차 재현: 첫 RPC가 서버에 저장된 뒤 응답이 유실(번호 없는 오류) — 「확인하지 못했습니다」만 나오고 「다시 남겨 주세요」 단정은 없다 · 자동 재시도 없음',async()=>{
  const r=await handleOnce({error:E_NET,savedOnServer:true});
  assert.equal(r.msg.textContent,MEMO_UNKNOWN);
  assert.ok(!r.msg.textContent.includes('저장하지 못했습니다'));
  assert.ok(r.msg.textContent.includes('없을 때만'),'문의함을 새로 열어 메모가 없을 때만 다시 남기라고 안내');
  assert.equal(r.store.saved,1);assert.equal(r.store.rpcCalls,1,'화면이 알아서 다시 기록하지 않음');
});
test('ⓔ Sol 3차 반례: 내 RPC는 DB 오류 번호가 있는 진짜 실패인데 다른 창에서 같은 사람·문의·글이 기록됨 — 저장됐다고 짐작하지 않고 「저장하지 못했습니다」',async()=>{
  const {store,sb}=errSb(E_DB);
  const t=boot('manager',{sb,tables:{consultation_inbox_replies:[{inbox_id:'x1',reply:'메모',created_at:'2026-09-30T06:00:00Z',author_id:'m1'}]}});
  const alerts=[];t.ctx.alert=m=>alerts.push(m);t.ctx.inboxLoad=async()=>{};
  const msg={textContent:''};
  assert.equal(await t.ctx.inboxMarkHandled([row('x1')],'메모',msg),true);
  assert.equal(msg.textContent,MEMO_FAIL);assert.deepEqual(alerts,[MEMO_FAIL]);assert.equal(store.rpcCalls,1);
});
test('ⓕ 답변 기록(inboxRecordReply)도 같은 판정: 저장됨 · 번호 있는 실패 · 번호 없는 오류(확인 못 함) — 실패·확인 못 함이면 입력칸 글은 지우지 않는다',async()=>{
  const run=async error=>{
    const {sb}=errSb(error);if(!error)sb.rpc.consultation_inbox_record_reply=()=>({error:null});
    const t=boot('manager',{sb});let history=0;t.ctx.inboxLoadHistory=async()=>{history++;};t.ctx.inboxLoad=async()=>{};
    t.ctx.__sel={id:'a1',ids:['a1'],processable:[]};vm.runInContext('INBOX_SELECTED=__sel;',t.ctx);
    const reply=t.dom.$('#inboxReply'),msg=t.dom.$('#inboxReplyMsg');reply.value='  답변 내용  ';
    await t.ctx.inboxRecordReply();return {reply:reply.value,msg:msg.textContent,history,reads:reads(t.log,'consultation_inbox_replies').length};
  };
  const ok=await run(null);assert.equal(ok.msg,'');assert.equal(ok.reply,'');assert.equal(ok.history,1);
  const failed=await run(E_DB);assert.equal(failed.msg,'기록 실패: 기록<실패>');assert.equal(failed.reply,'  답변 내용  ','입력칸 글 유지');assert.equal(failed.history,0);
  const unknown=await run(E_NET);assert.equal(unknown.msg,REPLY_UNKNOWN);assert.equal(unknown.reply,'  답변 내용  ','입력칸 글 유지');assert.equal(unknown.history,0);
  for(const r of [ok,failed,unknown])assert.equal(r.reads,0,'replies 개수 세기 요청 없음');
});
test('ⓖ 오류 번호 판정: SQLSTATE 5자리(P0001·42501·23505)와 PGRST 숫자(PGRST301)는 확실한 실패, 번호가 없거나 모양이 다르면 확인 못 함',async()=>{
  const t=boot('manager');
  for(const code of ['P0001','42501','23505','PGRST301','PGRST116'])assert.equal(t.ctx.inboxReplyErrorKnown({code,message:'x'}),true,code);
  for(const code of [undefined,null,'','ECONNRESET','20','FetchError','pgrst301'])assert.equal(t.ctx.inboxReplyErrorKnown({code,message:'x'}),false,String(code));
  assert.equal(t.ctx.inboxReplyErrorKnown(null),false);assert.equal(t.ctx.inboxReplyErrorKnown({message:'Failed to fetch'}),false);
  const known=boot('manager',{sb:errSb({code:'PGRST301',message:'JWT expired'}).sb});
  const r=await known.ctx.inboxRecordReplyOnce('a1','글');
  assert.deepEqual(JSON.parse(JSON.stringify({ok:r.ok,unknown:r.unknown})),{ok:false,unknown:false});
});

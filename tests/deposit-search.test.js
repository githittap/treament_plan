// 입금 탭 검색·과거 날짜 조회(2026-11-22) 시험.
// ① hr.html의 /* deposit-search:test-start */ ~ /* deposit-search:test-end */ 순수 함수(날짜 구간 KST 계산 · 검색어 정리 · 조회 계획)
// ② 화면(renderDeposit·depApply·depReset·depMore)은 hub7 하니스로 가짜 자료에 실제 실행.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const hr=fs.readFileSync(path.join(root,'hr.html'),'utf8').replace(/\r\n/g,'\n');
const {renderAll}=require('./fixtures/hub7-harness.cjs');
const block=hr.match(/\/\* deposit-search:test-start \*\/[\s\S]*?\/\* deposit-search:test-end \*\//);
assert.ok(block,'시험 구간 표지가 hr.html에 있어야 함');
const NAMES=['depParseYmd','depYmdText','depTzYmd','depYmdLabel','depTzStartIso','depRangeBounds','depCustomBounds','depEscapeLike','depNormalizeQuery','depOrFilter','depResolveView','depLimit','depTruncation','depApplyPlan','depServerCapped','depCanMore'];
const c={};vm.createContext(c);
vm.runInContext(block[0]+';this.h={'+NAMES.join(',')+',DEP_HARD_CAP};',c);
const h=c.h;
const clone=x=>JSON.parse(JSON.stringify(x));
const H=60*60*1000;

test('depParseYmd: 달력에 있는 날짜만 통과한다(윤일 포함) · 형식·범위 밖은 거부',()=>{
  assert.deepEqual(clone(h.depParseYmd('2026-11-22')),{y:2026,m0:10,d:22});
  assert.deepEqual(clone(h.depParseYmd(' 2028-02-29 ')),{y:2028,m0:1,d:29});
  for(const bad of ['2026-02-30','2026-02-29','2026-13-01','2026-00-10','26-1-1','2026-1-1','',null,undefined,'1999-12-31','abc','2026-11-22T00:00'])assert.equal(h.depParseYmd(bad),null,String(bad));
});

test('depTzYmd: KST 자정 경계 — UTC 15:00이 한국의 다음 날 0시',()=>{
  assert.equal(h.depTzYmd(Date.UTC(2026,10,21,15,0,0)),'2026-11-22');
  assert.equal(h.depTzYmd(Date.UTC(2026,10,21,14,59,59,999)),'2026-11-21');
  assert.equal(h.depTzYmd(Date.UTC(2026,11,31,15,0,0)),'2027-01-01');
});

test('depYmdLabel: 시간대와 무관하게 글자만 바꾼다(2026-09-05 → 2026.9.5)',()=>{
  assert.equal(h.depYmdLabel('2026-09-05'),'2026.9.5');
  assert.equal(h.depYmdLabel('2026-12-31'),'2026.12.31');
  assert.equal(h.depYmdLabel('이상한'),'');
});

test('depRangeBounds: 옛 식(오늘·7일·이번달)과 5개 시각에서 완전히 같다',()=>{
  const old=(range,nowMs)=>{
    const t=new Date(nowMs+9*H),y=t.getUTCFullYear(),mo=t.getUTCMonth(),d=t.getUTCDate();
    const kstIso=(yy,mm,dd)=>new Date(Date.UTC(yy,mm,dd)-9*H).toISOString();
    let fromIso,toIso=kstIso(y,mo,d+1);
    if(range==='today')fromIso=kstIso(y,mo,d);
    else if(range==='week')fromIso=kstIso(y,mo,d-7);
    else fromIso=kstIso(y,mo,1),toIso=kstIso(y,mo+1,1);
    return {fromIso,toIso};
  };
  const times=[Date.UTC(2026,9,1,3,0,0),Date.UTC(2026,11,31,14,0,0),Date.UTC(2026,11,31,15,0,0),Date.UTC(2026,10,3,1,0,0),Date.UTC(2026,0,1,0,0,0)];
  for(const t of times)for(const r of ['today','week','month','엉뚱한값',undefined])assert.deepEqual(clone(h.depRangeBounds(r,t)),old(r==='today'||r==='week'?r:'month',t),r+'@'+new Date(t).toISOString());
  assert.deepEqual(clone(h.depRangeBounds('month',Date.UTC(2026,11,31,15,0,0))),{fromIso:'2026-12-31T15:00:00.000Z',toIso:'2027-01-31T15:00:00.000Z'});
});

test('depCustomBounds: 하나만 넣으면 그 하루 · 둘 다면 종료일 당일 포함 · 순서·형식 오류',()=>{
  const day={from:'2026-09-30',to:'2026-09-30',fromIso:'2026-09-29T15:00:00.000Z',toIso:'2026-09-30T15:00:00.000Z'};
  assert.deepEqual(clone(h.depCustomBounds('2026-09-30','')),day);
  assert.deepEqual(clone(h.depCustomBounds('','2026-09-30')),day);
  assert.deepEqual(clone(h.depCustomBounds('2026-09-30','2026-09-30')),day);
  const r=h.depCustomBounds('2026-12-01','2026-12-31');
  assert.equal(r.fromIso,'2026-11-30T15:00:00.000Z');assert.equal(r.toIso,'2026-12-31T15:00:00.000Z');
  assert.deepEqual(clone(h.depCustomBounds('2026-10-05','2026-10-01')),{error:'order'});
  assert.deepEqual(clone(h.depCustomBounds('','')),{error:'empty'});
  assert.deepEqual(clone(h.depCustomBounds('  ',null)),{error:'empty'});
  assert.deepEqual(clone(h.depCustomBounds('쓰레기','')),{error:'format'});
  assert.deepEqual(clone(h.depCustomBounds('2026-02-30','')),{error:'format'});
  assert.deepEqual(clone(h.depCustomBounds('2026-09-30','x')),{error:'format'});
  assert.deepEqual(clone(h.depCustomBounds(' 2026-09-30 ','')),day);
});

test('depNormalizeQuery: 빈 값 · 공백 정리 · NFC · 금액 모양 · 40자 절단',()=>{
  for(const e of ['',' ','   \t',null,undefined])assert.deepEqual(clone(h.depNormalizeQuery(e)),{kind:'none',text:''});
  const t=h.depNormalizeQuery(' 홍 길동 ');
  assert.equal(t.kind,'text');assert.equal(t.text,'홍 길동');assert.equal(t.like,'홍길동');
  assert.equal(h.depNormalizeQuery('홍길동'.normalize('NFD')).like,'홍길동');
  for(const a of ['50,000','₩ 50,000원','50000원','₩50,000','50000'])assert.deepEqual(clone(h.depNormalizeQuery(a)).digits,'50000',a);
  assert.equal(h.depNormalizeQuery('1,00').kind,'text');
  assert.equal(h.depNormalizeQuery('1234567890123456').kind,'text');
  assert.equal(h.depNormalizeQuery('100%').kind,'text');
  const z=h.depNormalizeQuery('0123');assert.equal(z.kind,'amount');assert.equal(h.depOrFilter(z.digits),'amount.eq.123,account_tail.ilike.*0123*,payer_raw.ilike.*0123*');
  assert.equal(h.depNormalizeQuery('가'.repeat(100)).text.length,40);
  assert.doesNotThrow(()=>h.depNormalizeQuery('😀\u0000\u0007홍​길동'));
  assert.doesNotThrow(()=>h.depNormalizeQuery({toString(){return 'x';}}));
});

test('depEscapeLike: 역슬래시·퍼센트·밑줄 앞에 역슬래시',()=>{
  const bs=String.fromCharCode(92);
  assert.equal(h.depEscapeLike('a%b_c'+bs+'d'),'a'+bs+'%b'+bs+'_c'+bs+bs+'d');
  assert.equal(h.depEscapeLike('홍길동'),'홍길동');
  assert.equal(h.depNormalizeQuery('100% 입금').like,'100'+bs+'%입금');
});

test('depOrFilter: 숫자만 통과(or 문자열 주입 방어)',()=>{
  assert.equal(h.depOrFilter('50000'),'amount.eq.50000,account_tail.ilike.*50000*,payer_raw.ilike.*50000*');
  for(const bad of ['5;x','5,0','','a','5)6','1234567890123456',null,undefined,'-5','5.5'])assert.equal(h.depOrFilter(bad),'',String(bad));
});

test('depResolveView: 일반 보기 · 검색만(전체 기간) · 날짜(+검색) · 오류',()=>{
  const now=Date.UTC(2026,9,1,3,0,0);
  const r=h.depResolveView({range:'week',q:'',from:'',to:''},now);
  assert.equal(r.mode,'range');assert.deepEqual(clone({a:r.fromIso,b:r.toIso}),clone({a:h.depRangeBounds('week',now).fromIso,b:h.depRangeBounds('week',now).toIso}));
  const s=h.depResolveView({range:'month',q:'홍길동',from:'',to:''},now);
  assert.equal(s.mode,'search_all');assert.equal(s.fromIso,null);assert.equal(s.toIso,null);assert.equal(s.qn.kind,'text');
  const c1=h.depResolveView({range:'month',q:'',from:'2026-09-30',to:''},now);
  assert.equal(c1.mode,'custom');assert.equal(c1.fromIso,'2026-09-29T15:00:00.000Z');assert.equal(c1.toIso,'2026-09-30T15:00:00.000Z');assert.equal(c1.qn.kind,'none');
  const c2=h.depResolveView({range:'month',q:'50,000',from:'2026-09-01',to:'2026-09-30'},now);
  assert.equal(c2.mode,'custom');assert.equal(c2.qn.kind,'amount');
  assert.deepEqual(clone(h.depResolveView({range:'month',q:'x',from:'2026-10-05',to:'2026-10-01'},now)),{error:'order'});
  assert.deepEqual(clone(h.depResolveView({range:'month',q:'x',from:'망',to:''},now)),{error:'format'});
  assert.equal(h.depResolveView(null,now).mode,'range');
});

function fakeQuery(){const calls=[];const q=new Proxy({},{get(_,k){return (...a)=>{calls.push([k,...clone(a)]);return q;};}});return {q,calls};}
test('depApplyPlan: 일반 보기는 옛 호출 순서와 같고, 검색은 gte/lt 없이 ilike 하나 · 숫자는 or 하나 · 날짜+검색은 모두',()=>{
  const now=Date.UTC(2026,9,1,3,0,0);
  const run=(st,limit=300)=>{const f=fakeQuery();h.depApplyPlan(f.q,h.depResolveView(st,now),limit);return f.calls;};
  const b=h.depRangeBounds('month',now);
  assert.deepEqual(run({range:'month'}),[['gte','bank_dt',b.fromIso],['lt','bank_dt',b.toIso],['order','bank_dt',{ascending:false}],['order','id',{ascending:false}],['limit',300]]);
  assert.deepEqual(run({range:'month',q:'홍길동'}),[['ilike','payer_raw','%홍길동%'],['order','bank_dt',{ascending:false}],['order','id',{ascending:false}],['limit',300]]);
  assert.deepEqual(run({range:'month',q:'50,000'}).slice(0,1),[['or','amount.eq.50000,account_tail.ilike.*50000*,payer_raw.ilike.*50000*']]);
  const both=run({range:'month',q:'홍',from:'2026-09-01',to:'2026-09-30'},900);
  assert.deepEqual(both.map(x=>x[0]),['gte','lt','ilike','order','order','limit']);assert.equal(both[5][1],900);
  assert.equal(run({range:'month',q:'50,000'}).filter(x=>x[0]==='ilike').length,0);
});

test('depLimit: 더 보기마다 같은 건수만큼 · 3000건 상한 · 잘못된 값은 300',()=>{
  const cases=[[300,0,300],[300,2,900],[300,9,3000],[300,50,3000],[1000,5,3000],[300,-1,300],[300,NaN,300],[50,1,100],[0,0,300],['abc',0,300],[5000,0,5000]];
  for(const [b,m,e] of cases)assert.equal(h.depLimit(b,m),e,b+','+m);
  assert.equal(h.DEP_HARD_CAP,3000);
});

test('depTruncation: 전체 건수를 알면 비교 · 모르면 한도 도달로 추정',()=>{
  assert.deepEqual(clone(h.depTruncation(2,5,300)),{total:5,truncated:true});
  assert.deepEqual(clone(h.depTruncation(5,5,300)),{total:5,truncated:false});
  assert.deepEqual(clone(h.depTruncation(300,null,300)),{total:null,truncated:true});
  assert.deepEqual(clone(h.depTruncation(2,undefined,300)),{total:null,truncated:false});
  assert.deepEqual(clone(h.depTruncation(0,0,300)),{total:0,truncated:false});
});

test('depServerCapped·depCanMore: 서버가 limit보다 적게 돌려주면 더 보기 대신 한도 안내',()=>{
  assert.equal(h.depServerCapped(1000,2500,1200),true);
  assert.equal(h.depServerCapped(300,2500,300),false);
  assert.equal(h.depServerCapped(5,5,300),false);
  assert.equal(h.depServerCapped(300,null,300),false);
  assert.equal(h.depCanMore(300,2500,300,0),true);
  assert.equal(h.depCanMore(1000,2500,300,3),false);
  assert.equal(h.depCanMore(3000,5000,300,9),false);
});

/* ───────── 화면(하니스) ───────── */
const run=(o,fn)=>renderAll(hr,Object.assign({engine:true,probe:true,textRows:[],settings:{}},o||{})).then(fn);
const render=async(P,role,state,sbOver)=>{
  const r=await P.asRole(role,null,sbOver);
  for(const k of Object.keys(state||{}))r.api.set(k,state[k]);
  r.ctx.TAB='deposit';
  const m={innerHTML:''};await r.api.renderDeposit(m);await P.flush();
  return {r,m};
};
test('화면: 기본 상태는 옛 조회(gte,lt,limit 300 한 번)와 같고 폼·칩이 보인다',()=>run({},async P=>{
  const {r,m}=await render(P,'owner',{DEP_RANGE:'month'});
  assert.deepEqual(clone(r.ctx.sb.limits),[['deposits',300]]);
  assert.deepEqual(clone(r.ctx.sb.filters.map(f=>f[1])),['gte','lt']);
  assert.match(m.innerHTML,/id="depQ"/);assert.match(m.innerHTML,/id="depFrom"/);assert.match(m.innerHTML,/id="depTo"/);
  assert.ok(m.innerHTML.includes('class="mini stamp" onclick="setDepRange(\'month\')"'));
  assert.ok(!m.innerHTML.includes('id="depNote"'),'일반 보기에서 안 잘렸으면 요약줄 없음');
}));
test('화면: 검색·숫자 검색·날짜·날짜+검색 조회 조건',()=>run({},async P=>{
  let x=await render(P,'owner',{DEP_Q:'홍길동'});
  assert.deepEqual(clone(x.r.ctx.sb.filters),[['deposits','ilike',['payer_raw','%홍길동%']]]);
  assert.ok(!x.m.innerHTML.includes('stamp'),'검색 모드에서는 어느 칩도 강조하지 않음');
  assert.ok(x.m.innerHTML.includes('전체 기간 · 검색: 홍길동 · 2건'));
  x=await render(P,'owner',{DEP_Q:'50,000'});
  assert.deepEqual(clone(x.r.ctx.sb.filters),[['deposits','or',['amount.eq.50000,account_tail.ilike.*50000*,payer_raw.ilike.*50000*']]]);
  x=await render(P,'owner',{DEP_FROM:'2026-09-30'});
  assert.deepEqual(clone(x.r.ctx.sb.filters.map(f=>[f[1],f[2][1]])),[['gte','2026-09-29T15:00:00.000Z'],['lt','2026-09-30T15:00:00.000Z']]);
  assert.ok(x.m.innerHTML.includes('2026.9.30 · 2건'));
  x=await render(P,'owner',{DEP_FROM:'2026-09-01',DEP_TO:'2026-09-30',DEP_Q:'카드'});
  assert.deepEqual(clone(x.r.ctx.sb.filters.map(f=>f[1])),['gte','lt','ilike']);
  assert.ok(x.m.innerHTML.includes('2026.9.1 ~ 2026.9.30 · 검색: 카드 · 2건'));
}));
test('화면: 검색어는 입력칸과 요약줄에서 이스케이프된다(XSS)',()=>run({},async P=>{
  const q='<img src=x onerror="a"> \'q\'';
  const {m}=await render(P,'owner',{DEP_Q:q});
  assert.ok(!m.innerHTML.includes('<img src=x'));
  assert.ok(m.innerHTML.includes('value="&lt;img src=x onerror=&quot;a&quot;&gt; \'q\'"'));
  assert.ok(m.innerHTML.includes('검색: &lt;img src=x onerror=&quot;a&quot;&gt; \'q\''));
}));
test('화면: 권한 — 일반 직원은 안내만 보이고 deposits 조회가 0번 · 데스크·실장·원장은 폼이 보임',()=>run({},async P=>{
  const s=await render(P,'staff',{});
  assert.ok(s.m.innerHTML.includes('예치금은 데스크·실장·원장만 조회할 수 있습니다.'));assert.ok(!s.m.innerHTML.includes('depQ'));
  assert.deepEqual(clone(s.r.ctx.sb.limits),[]);assert.deepEqual(clone(s.r.ctx.sb.filters),[]);
  for(const role of ['desk','chief','owner']){const x=await render(P,role,{});assert.match(x.m.innerHTML,/id="depQ"/,role);}
}));
test('화면: 잘림·더 보기·한도 안내·빈 결과·오류',()=>run({},async P=>{
  const rows=n=>Array.from({length:n},(_,i)=>({id:n-i,bank_dt:'2026-10-01T01:00:00Z',amount:1000,payer_raw:'가',is_card:false,account_tail:'1'}));
  let x=await render(P,'owner',{DEP_Q:'가'},{tables:{deposits:{list:rows(300),count:500}}});
  assert.ok(x.m.innerHTML.includes('300건 표시 · 전체 500건'));assert.ok(x.m.innerHTML.includes('onclick="depMore()">더 보기</button>'));
  x=await render(P,'owner',{DEP_Q:'가'},{tables:{deposits:{list:rows(300)}}});
  assert.ok(x.m.innerHTML.includes('300건 표시 · 더 있을 수 있음'));
  x=await render(P,'owner',{DEP_Q:'가',DEP_MORE:9},{tables:{deposits:{list:rows(3000),count:5000}}});
  assert.deepEqual(clone(x.r.ctx.sb.limits),[['deposits',3000]]);
  assert.ok(!x.m.innerHTML.includes('depMore()'));assert.ok(x.m.innerHTML.includes('표시 한도(3000건)에 도달했습니다.'));
  x=await render(P,'owner',{DEP_Q:'가',DEP_MORE:3},{tables:{deposits:{list:rows(1000),count:2500}}});
  assert.deepEqual(clone(x.r.ctx.sb.limits),[['deposits',1200]]);
  assert.ok(!x.m.innerHTML.includes('depMore()'));assert.ok(x.m.innerHTML.includes('표시 한도(1000건)에 도달했습니다.'));
  x=await render(P,'owner',{DEP_Q:'zzz'},{tables:{deposits:{list:[]}}});
  assert.ok(x.m.innerHTML.includes('조건에 맞는 입금 내역이 없습니다'));
  x=await render(P,'owner',{DEP_RANGE:'month'},{tables:{deposits:{list:[]}}});
  assert.ok(x.m.innerHTML.includes('입금 내역이 없습니다 (자동 수집 대기)')&&!x.m.innerHTML.includes('조건에 맞는'));
  x=await render(P,'owner',{DEP_RANGE:'month'},{tables:{deposits:{error:{message:'실패<x>'}}}});
  assert.ok(x.m.innerHTML.includes('입금 내역을 불러오지 못했습니다: 실패&lt;x&gt;'));assert.match(x.m.innerHTML,/id="depQ"/);
}));
test('화면: depApply — 잘못된 날짜·순서 오류는 조회하지 않고 안내, 정상이면 상태 저장 후 다시 그림',()=>run({},async P=>{
  const go=async(vals)=>{const r=await P.asRole('owner');r.ctx.$('#depQ').value=vals.q||'';r.ctx.$('#depFrom').value=vals.f||'';r.ctx.$('#depTo').value=vals.t||'';
    const ret=r.api.depApply({preventDefault(){}});return {r,ret,state:[r.api.get('DEP_Q'),r.api.get('DEP_FROM'),r.api.get('DEP_TO'),r.api.get('DEP_MORE')]};};
  let x=await go({f:'2026-02-30'});assert.equal(x.ret,false);assert.deepEqual(x.state,['','','',0]);assert.ok(!x.r.log.includes('render'));assert.ok(x.r.dom.hist.some(h=>h[0]==='#depMsg'&&h[2]==='날짜를 올바르게 넣어 주세요.'));
  x=await go({f:'2026-10-05',t:'2026-10-01'});assert.deepEqual(x.state,['','','',0]);assert.ok(x.r.dom.hist.some(h=>h[0]==='#depMsg'&&h[2]==='시작일이 종료일보다 늦습니다.'));
  x=await go({q:'홍',f:'2026-10-01'});assert.deepEqual(x.state,['홍','2026-10-01','',0]);assert.ok(x.r.log.includes('render'));
}));
test('화면: 칩과 초기화는 검색어·날짜·더 보기를 지운다 (setDepRange 원문 · depReset 실행)',()=>run({},async P=>{
  assert.match(hr,/function setDepRange\(r\)\{DEP_RANGE=r;DEP_Q='';DEP_FROM='';DEP_TO='';DEP_MORE=0;render\(\);\}/);
  const r=await P.asRole('owner');r.api.set('DEP_Q','x');r.api.set('DEP_FROM','2026-09-01');r.api.set('DEP_RANGE','week');r.api.set('DEP_MORE',3);
  r.api.depReset();
  assert.deepEqual([r.api.get('DEP_Q'),r.api.get('DEP_FROM'),r.api.get('DEP_TO'),r.api.get('DEP_MORE'),r.api.get('DEP_RANGE')],['','','',0,'month']);
  r.api.depMore();assert.equal(r.api.get('DEP_MORE'),1);
}));
test('화면: 허브 설정에서 새 문구를 바꾸면 폼 문구가 바뀐다',()=>run({textRows:[{key:'dep.search_ph',value:'«검색칸»'},{key:'dep.f_from',value:'«시작»'},{key:'dep.btn_apply',value:'«조회단추»'},{key:'dep.date_hint',value:'«안내»'}]},async P=>{
  const {m}=await render(P,'owner',{});
  for(const t of ['placeholder="«검색칸»"','«시작»','«조회단추»','«안내»'])assert.ok(m.innerHTML.includes(t),t);
}));
test('코드: 입금 화면의 새 문구는 hubT 기본값이고 권한 문(canViewDeposit)과 limit 호출 수는 그대로',()=>{
  assert.ok(/async function renderDeposit\(m\)\{\n  if\(!canViewDeposit\(ME\)\)/.test(hr));
  assert.equal((hr.match(/hubN\('dep\.list_limit',300\)/g)||[]).length,1);
  assert.ok(!/setDepRange\('custom'\)/.test(hr));
  assert.match(hr,/hub-texts\.js\?v=2026112711/); // 2026-11-27 휴게시간 설정·수기 연장 인정·근무표 요약 글(근무조 지각 기준·월 마감 결재 글 뒤 · 리뷰 요청 문자 글 · 병원 PC 중계 줄 뒤)
});

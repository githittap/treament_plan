// 직원허브 「운세 카드」 시험 — 카드 모양은 seed로 같게 · 글/색/아이템 목록 파싱 · 상품 입력 변환 · 확률 합계·기대 지급액 · 글 키 등록 · 화면 연결 계약.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const src=read('hub-fortune.js');

function load(){
  const ctx={globalThis:null,console};ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(src.replace('})(typeof window!==\'undefined\'?window:globalThis);','})(globalThis);'),ctx);
  return ctx;
}
const g=load(),H=g.HubFortune._t,DEFS=g.HUB_FORTUNE_TEXT_DEFS;
const T=Object.fromEntries(DEFS.map(d=>[d[0],d[2]]));
const srcOf=()=>({lines:T['intro.fortune_lines'],colors:T['intro.fortune_colors'],items:T['intro.fortune_items'],grades:T['intro.fortune_grades']});

test('글 키는 허브 글 표 규칙(소문자·숫자·점·밑줄)을 지키고 겹치지 않으며 intro.fortune_ 로 시작한다',()=>{
  const seen=new Set();
  DEFS.forEach(d=>{assert.match(d[0],/^[a-z][a-z0-9_.]{1,80}$/);assert.match(d[0],/^intro\.fortune_/);assert.ok(!seen.has(d[0]),'중복 '+d[0]);seen.add(d[0]);assert.ok(d[1]&&d[2],d[0]);assert.ok(d[2].length<20000);});
  // 첫 화면 글과도 겹치지 않음
  const intro=read('hub-intro.js'),keys=[...intro.matchAll(/^\s*\['(intro\.[a-z0-9_.]+)'/gm)].map(m=>m[1]);
  DEFS.forEach(d=>assert.ok(!keys.includes(d[0]),'hub-intro와 중복 '+d[0]));
});
test('같은 seed면 같은 카드, 다른 seed면 보통 다른 카드',()=>{
  const a=H.buildCard(12345,srcOf()),b=H.buildCard(12345,srcOf());
  assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
  const seen=new Set();for(let s=1;s<=200;s++)seen.add(H.buildCard(s,srcOf()).line);
  assert.ok(seen.size>8,'한 줄 운세가 골고루 나옴');
});
test('카드 값 범위: 별 1~5 · 숫자 1~99 · 등급 이름은 별 개수와 반대로 매핑',()=>{
  const counts=[0,0,0,0,0,0];
  for(let s=1;s<=4000;s++){
    const c=H.buildCard(s,srcOf());
    assert.ok(c.stars>=1&&c.stars<=5);assert.ok(c.number>=1&&c.number<=99);assert.ok(c.line&&c.item&&c.color.name);
    counts[c.stars]++;
    if(c.stars===5)assert.match(c.grade,/대길/);
    if(c.stars===1)assert.match(c.grade,/보통/);
  }
  for(let i=1;i<=5;i++)assert.ok(counts[i]>0,'별 '+i+'개도 나옴');
  assert.ok(counts[3]>counts[5]&&counts[4]>counts[1],'3·4개가 5·1개보다 흔함');
});
test('원장이 목록을 비워도 카드가 깨지지 않는다',()=>{
  const c=H.buildCard(7,{lines:'',colors:'',items:'',grades:''});
  assert.equal(c.line,'');assert.equal(c.grade,'');assert.equal(c.color.name,'');assert.equal(c.item,'');assert.ok(c.stars>=1);
});
test('색 목록 파싱: 이름|#색, 색 없는 줄, 잘못된 색은 색 없이',()=>{
  const r=H.parseColors('민트|#2fd9c4\n 크림 \n이상함|red\n\n라벤더|#b9a4ff ');
  assert.deepEqual(JSON.parse(JSON.stringify(r)),[{name:'민트',hex:'#2fd9c4'},{name:'크림',hex:''},{name:'이상함',hex:''},{name:'라벤더',hex:'#b9a4ff'}]);
});
test('금액·오류 글',()=>{
  assert.equal(H.fmtWon(5000),'5,000원');assert.equal(H.fmtWon('abc'),'0원');
  assert.equal(H.errMsg({message:'invalid_prizes: 확률은 0~100 사이로 적어 주세요(a).'}),'확률은 0~100 사이로 적어 주세요(a).');
  assert.equal(H.errMsg({message:'owner_only'}),'원장만 고칠 수 있어요.');
  assert.equal(H.errMsg({message:'something else'}),'저장하지 못했어요. 잠시 뒤 다시 해 주세요.');
  assert.equal(H.errMsg(null,'기본'),'기본');
});
test('상품 입력 → 서버 목록: 빈 개수는 null(무제한), 금액 빈칸은 0, 이름은 다듬음',()=>{
  const p=H.rowsToPayload([{id:3,name:' 커피 ',amount_krw:'5000',probability_pct:'1.5',stock_total:'',stock_monthly:'4',stock_daily:'',active:true},{name:'꽝',amount_krw:'',probability_pct:'0',active:false}]);
  assert.deepEqual(JSON.parse(JSON.stringify(p)),[
    {id:3,name:'커피',amount_krw:5000,probability_pct:1.5,stock_total:null,stock_monthly:4,stock_daily:null,active:true},
    {id:null,name:'꽝',amount_krw:0,probability_pct:0,stock_total:null,stock_monthly:null,stock_daily:null,active:false}]);
  assert.equal(H.rowsToPayload([{name:'x',probability_pct:''}])[0].probability_pct,null,'확률 빈칸은 서버가 거절하도록 null');
});
test('확률 합계·기대 지급액·월 최대 지급액',()=>{
  const rows=[{probability_pct:'5',amount_krw:'10000',stock_monthly:'2',active:true},{probability_pct:'20',amount_krw:'1000',stock_total:'30',active:true},{probability_pct:'50',amount_krw:'999999',active:false}];
  const s=H.prizeStats(rows);
  assert.equal(s.sumPct,25);assert.equal(s.expectPerDraw,700);assert.equal(s.monthlyMax,2*10000+30*1000);
  assert.equal(H.prizeStats([{probability_pct:'5',amount_krw:'10000',active:true}]).monthlyMax,null,'한도 없는 상품이 있으면 월 최대는 계산하지 않음');
  assert.equal(H.prizeStats([]).sumPct,0);
});
test('화면 연결 계약: hr.html이 hub-fortune.js를 hub-intro.js보다 먼저 불러오고 fortune 옵션을 넘긴다',()=>{
  const hr=read('hr.html');
  const a=hr.indexOf('hub-fortune.js'),b=hr.indexOf('hub-intro.js');
  assert.ok(a>0&&b>a,'hub-fortune.js가 먼저');
  assert.match(hr,/fortune:\{sb:sb\}/);
});
test('hub-intro.js: 글 목록 합치기 · 숨김 단추 · 창이 열린 동안 Enter/Esc 무시 · 불꽃 연출',()=>{
  const intro=read('hub-intro.js');
  assert.match(intro,/HUB_FORTUNE_TEXT_DEFS/);
  assert.match(intro,/data-fortune[^>]*style="display:none"/,'서버 상태를 읽기 전에는 단추를 숨김');
  assert.match(intro,/S\.destroyed\|\|S\.fortuneOpen/);
  assert.match(intro,/celebrate:function\(level\)/);
  assert.match(intro,/fortune_status/);
});
test('운세 카드는 화면 난수로 당첨을 정하지 않는다(당첨은 서버 함수 fortune_draw만)',()=>{
  const code=src.replace(/\/\* hub-fortune:test-start \*\/[\s\S]*?\/\* hub-fortune:test-end \*\//,''); // 카드 모양용 난수 블록 제외
  assert.ok(!/Math\.random/.test(code.replace(/function sparkle[\s\S]*?\r?\n}\r?\n/,'')),'sparkle(반짝이 연출) 밖에서 Math.random 사용 금지');
  assert.match(code,/rpc\(S\.ctx\.sb,'fortune_draw'\)/);
});
test('SQL 계약: 직원은 표를 못 쓰고, 뽑기는 하루 횟수·개수 한도를 서버에서 지킨다',()=>{
  const sql=read('db/hub_fortune.sql');
  assert.match(sql,/revoke all on table public\.fortune_settings, public\.fortune_prizes, public\.fortune_draws from public, anon, authenticated/);
  assert.ok(!/grant (insert|update|delete)[^;]*fortune_/.test(sql),'직원에게 쓰기 권한 없음');
  assert.match(sql,/for update/);
  assert.match(sql,/security definer set search_path = ''/);
  ['fortune_status','fortune_draw','fortune_admin_overview','fortune_save_settings','fortune_save_prizes','fortune_mark_paid'].forEach(f=>assert.match(sql,new RegExp('create or replace function public\\.'+f)));
});

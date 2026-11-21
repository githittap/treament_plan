// 직원허브 첫 화면 「이달의 점술관」 시험 — 달 계산(서울 기준) · 카드 덱 고르기 · 도감 · 점괘 · D-day · 글 키 등록 · 화면 연결 계약.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const introSrc=read('hub-intro.js'),fortuneSrc=read('hub-fortune.js');

function load(){
  const ctx={console,URLSearchParams};ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(fortuneSrc.replace('})(typeof window!==\'undefined\'?window:globalThis);','})(globalThis);'),ctx);
  vm.runInContext(introSrc.replace('})(typeof window!==\'undefined\'?window:globalThis);','})(globalThis);'),ctx);
  return ctx;
}
const g=load(),O=g.HubIntroOracle,DEFS=g.HUB_INTRO_TEXT_DEFS;
const plain=v=>JSON.parse(JSON.stringify(v));
const defOf=k=>{const d=DEFS.find(x=>x[0]===k);assert.ok(d,'DEFS에 '+k+' 없음');return d[2];};

test('글 키: 허브 글 표 규칙을 지키고 중복 없고 운세 카드 키(intro.fortune_)와 겹치지 않는다',()=>{
  const seen=new Set();
  DEFS.forEach(d=>{
    assert.match(d[0],/^[a-z][a-z0-9_.]{1,80}$/,d[0]);
    assert.ok(!seen.has(d[0]),'중복 '+d[0]);seen.add(d[0]);
    assert.ok(d[1],d[0]+' 위치 설명');assert.ok(String(d[2]).length<20000,d[0]);
  });
  const fortuneKeys=new Set(g.HUB_FORTUNE_TEXT_DEFS.map(d=>d[0]));
  DEFS.forEach(d=>{if(/^intro\.fortune_/.test(d[0]))assert.ok(fortuneKeys.has(d[0]),'intro.fortune_ 는 hub-fortune.js 전용 '+d[0]);});
});
test('새 키는 월별 12달 × 6칸(이름·카드 목록·배경·이모지·D-day·띠별자리)이 전부 등록돼 있다',()=>{
  const keys=new Set(DEFS.map(d=>d[0]));
  for(let n=1;n<=12;n++){
    const mm=(n<10?'0':'')+n;
    ['name','deck','bg','glyphs','event','mode'].forEach(f=>assert.ok(keys.has('intro.oracle_m'+mm+'_'+f),'intro.oracle_m'+mm+'_'+f));
    assert.ok(defOf('intro.oracle_m'+mm+'_name').length>0);
    assert.match(defOf('intro.oracle_m'+mm+'_mode'),/^(none|ddi|star)$/);
  }
  ['intro.card_oracle','intro.oracle_hero_mode','intro.oracle_title','intro.oracle_hint','intro.oracle_disclaimer','intro.oracle_deck_default','intro.oracle_saju_btn','intro.oracle_saju_note','intro.balance','intro.card_balance'].forEach(k=>assert.ok(keys.has(k),k));
  assert.equal(defOf('intro.oracle_hero_mode'),'theme','기본은 이달의 점술관 · animal 로 바꾸면 옛 동물');
});
test('치아 상식 카드(intro.facts·intro.card_fact)는 글 목록과 화면에서 빠졌다',()=>{
  const keys=DEFS.map(d=>d[0]);
  assert.ok(!keys.includes('intro.facts'));assert.ok(!keys.includes('intro.card_fact'));
  assert.ok(!/intro\.facts|intro\.card_fact|data-slot="fact"/.test(introSrc));
  assert.match(introSrc,/data-slot="oracle"/);
});
test('덱 파싱: 이름|이모지|풀이 · 빈 줄·| 모자람·풀이 안의 | 도 깨지지 않는다',()=>{
  const d=plain(O.parseDeck('바보|🃏|새 시작\n\n  \n이름만\n둘만|🍀\n풀이|✨|앞|뒤\n|||'));
  assert.deepEqual(d,[{name:'바보',emoji:'🃏',text:'새 시작'},{name:'이름만',emoji:'',text:''},{name:'둘만',emoji:'🍀',text:''},{name:'풀이',emoji:'✨',text:'앞|뒤'}]);
  assert.deepEqual(plain(O.parseDeck('')),[]);assert.deepEqual(plain(O.parseDeck(null)),[]);
});
test('같은 seed면 같은 카드 · 다른 seed는 골고루 · 빈 덱은 null',()=>{
  const deck=O.parseDeck(defOf('intro.oracle_m12_deck'));
  assert.equal(deck.length,22);
  assert.deepEqual(plain(O.pickDeckCard(deck,123456)),plain(O.pickDeckCard(deck,123456)));
  const seen=new Set();for(let s=1;s<=400;s++)seen.add(O.pickDeckCard(deck,s*7919).name);
  assert.ok(seen.size>=18,'22장 중 골고루 나옴: '+seen.size);
  assert.equal(O.pickDeckCard([],5),null);assert.equal(O.pickDeckCard(null,5),null);
});
test('12·1·2·3월은 카드 목록이 채워져 있고, 4~11월은 비어 있으면 범용 목록을 쓴다',()=>{
  [12,1,2,3].forEach(n=>{
    const deck=O.parseDeck(O.months[n].deck);
    assert.ok(deck.length>=10,n+'월 카드 수 '+deck.length);
    deck.forEach(c=>assert.ok(c.name&&c.emoji&&c.text,n+'월 '+JSON.stringify(c)));
  });
  for(let n=4;n<=11;n++)assert.equal(O.months[n].deck,'',n+'월은 범용 목록 사용');
  const dflt=O.parseDeck(defOf('intro.oracle_deck_default'));
  assert.ok(dflt.length>=8);dflt.forEach(c=>assert.ok(c.name&&c.emoji&&c.text));
  assert.match(introSrc,/function currentDeck/);
});
test('이번 달은 서울(UTC+9) 기준 · ?introMonth=1~12 로 강제',()=>{
  assert.equal(O.oracleMonth(new Date('2026-11-30T14:59:59Z'),''),11);
  assert.equal(O.oracleMonth(new Date('2026-11-30T15:00:00Z'),''),12,'서울은 12월 1일 0시');
  assert.equal(O.oracleMonth(new Date('2026-12-31T15:00:00Z'),''),1,'서울은 1월 1일');
  assert.equal(O.oracleMonth(new Date('2026-11-22T03:00:00Z'),'?introMonth=3'),3);
  assert.equal(O.oracleMonth(new Date('2026-11-22T03:00:00Z'),'?introMonth=12'),12);
  ['?introMonth=0','?introMonth=13','?introMonth=abc','?introMonth=','?x=1'].forEach(q=>assert.equal(O.oracleMonth(new Date('2026-11-22T03:00:00Z'),q),11,q));
});
test('도감: 이번 달 기록만 · 같은 카드는 한 번만 · 달 경계(서울 날짜 문자열) · 덱이 없으면 0',()=>{
  const deck=O.parseDeck(defOf('intro.oracle_m12_deck'));
  const seedFor=name=>{for(let s=1;s<100000;s++)if(O.pickDeckCard(deck,s).name===name)return s;throw new Error(name);};
  const a=seedFor('바보'),b=seedFor('마법사'),c=seedFor('여사제');
  const rows=[{draw_date:'2026-12-01',seed:a},{draw_date:'2026-12-01',seed:a},{draw_date:'2026-12-05',seed:b},{draw_date:'2026-11-30',seed:c},{draw_date:'2027-01-01',seed:c}];
  assert.deepEqual(plain(O.dexFromDraws(rows,deck,2026,12)),{n:2,m:22},'11/30·1/1 은 12월이 아님, 같은 카드 중복은 1');
  assert.deepEqual(plain(O.dexFromDraws(rows,deck,2026,11)),{n:1,m:22});
  assert.deepEqual(plain(O.dexFromDraws([],deck,2026,12)),{n:0,m:22});
  assert.deepEqual(plain(O.dexFromDraws(rows,[],2026,12)),{n:0,m:0});
  assert.deepEqual(plain(O.monthRange(2026,12)),{from:'2026-12-01',to:'2027-01-01'});
  assert.deepEqual(plain(O.monthRange(2027,1)),{from:'2027-01-01',to:'2027-02-01'});
});
test('오늘의 점괘: 같은 계정·같은 날이면 같은 글 · 계정이 다르면 대체로 다름 · 목록이 비어도 안 깨짐',()=>{
  const L={total:defOf('intro.oracle_read_total').split('\n'),work:defOf('intro.oracle_read_work').split('\n'),people:defOf('intro.oracle_read_people').split('\n'),time:defOf('intro.oracle_lucky_time').split('\n'),colors:['민트','살구색']};
  assert.deepEqual(plain(O.oracleReading('u1','2026-12-01',L)),plain(O.oracleReading('u1','2026-12-01',L)));
  const seen=new Set();for(let i=0;i<60;i++)seen.add(O.oracleReading('u'+i,'2026-12-01',L).total);
  assert.ok(seen.size>=6);
  const r=O.oracleReading('u1','2026-12-01',L);assert.ok(r.number>=1&&r.number<=99);
  const e=O.oracleReading('u1','2026-12-01',{total:[],work:[],people:[],time:[],colors:[]});
  assert.equal(e.total,'');assert.equal(e.color,'');assert.ok(e.number>=1);
  [L.total,L.work,L.people].forEach(a=>{assert.ok(a.length>=10);a.forEach(s=>assert.ok(!/질병|이별|흉|불길|사고|죽/.test(s),'긍정 톤만: '+s));});
});
test('별자리 순위: 날짜가 같으면 모두 같은 순위 · 12개 전부 한 번씩',()=>{
  const names=defOf('intro.oracle_stars').split('\n');assert.equal(names.length,12);
  const a=plain(O.starRanking(names,'2027-03-02')),b=plain(O.starRanking(names,'2027-03-02')),c=plain(O.starRanking(names,'2027-03-03'));
  assert.deepEqual(a,b);assert.equal(new Set(a).size,12);assert.notDeepEqual(a,c);
});
test('D-day: 해마다 같은 날(MM-DD)·해를 적은 날·오늘·지난 날·범위 밖',()=>{
  const p=(y,m,d)=>({y:y,m:m,d:d});
  assert.deepEqual(plain(O.nextEvent('2027-02-06|설날',p(2027,1,1),60)),{label:'설날',n:36});
  assert.deepEqual(plain(O.nextEvent('2027-02-06|설날',p(2027,2,6),60)),{label:'설날',n:0},'그날은 0');
  assert.equal(O.nextEvent('2027-02-06|설날',p(2027,2,7),60),null,'지난 날은 안 보임');
  assert.deepEqual(plain(O.nextEvent('12-25|크리스마스',p(2026,12,20),60)),{label:'크리스마스',n:5});
  assert.deepEqual(plain(O.nextEvent('01-01|새해',p(2026,12,31),60)),{label:'새해',n:1},'해를 넘겨 센다');
  assert.equal(O.nextEvent('2027-09-15|추석',p(2027,1,1),60),null,'60일 밖');
  assert.deepEqual(plain(O.nextEvent('12-25|크리스마스\n12-31|연말',p(2026,12,1),60)),{label:'크리스마스',n:24},'가까운 것 하나');
  ['','쓰레기','13-40|x','02-30|','2027-02-06'].forEach(t=>assert.equal(O.nextEvent(t,p(2027,1,1),60),null,JSON.stringify(t)));
});
test('명절 기본값 날짜는 음력 도구(lunar.js)로 다시 확인한 날짜와 같다(설날 2027-02-06 · 칠석 2027-08-08 · 추석 2027-09-15)',()=>{
  const m={exports:{}};new Function('module','exports',read('lunar.js')).call({},m,m.exports);
  const L=m.exports.Lunar,solar=(mo,d)=>L.fromYmd(2027,mo,d).getSolar().toYmd();
  assert.equal(solar(1,1),'2027-02-06');assert.equal(solar(7,7),'2027-08-08');assert.equal(solar(8,15),'2027-09-15');
  assert.match(O.months[2].event,/2027-02-06\|설날/);assert.match(O.months[1].event,/2027-02-06\|설날/);
  assert.match(O.months[8].event,/2027-08-08\|칠석/);assert.match(O.months[9].event,/2027-09-15\|추석/);
  const all=Object.values(O.months).map(x=>x.event).join('\n');
  assert.ok(!/수능/.test(all),'날짜가 불확실한 수능은 넣지 않음');
});
test('배경 색: #색번호만 받는다(글 고치기 값이 화면 스타일에 들어감) · 모자라면 대체',()=>{
  const fb=['#111111','#222222','#333333','#444444'];
  const bg=(t)=>plain(O.parseBg(t,fb));
  assert.deepEqual(bg('#2a1450,#150a30,#07031a,#e3b341'),['#2a1450','#150a30','#07031a','#e3b341']);
  assert.deepEqual(bg('#2a1450 #150a30 #07031a'),['#2a1450','#150a30','#07031a']);
  assert.deepEqual(bg('red,blue,url(x)'),fb);
  assert.deepEqual(bg('#fff;background:url(x),#222,#333'),fb,'세미콜론 섞인 값은 버림 → 3개 미만이면 대체');
  assert.deepEqual(bg(''),fb);
  Object.values(O.months).forEach(mo=>{const c=O.parseBg(mo.bg,[]);assert.ok(c.length>=3,'월 기본 배경 색');});
});
test('흩날리는 이모지: 개수 상한 · 같은 날 같은 모양 · 이모지 목록이 비면 없음 · 글자 길이·개수 제한',()=>{
  const gl=O.parseGlyphs('❄️ ⛄ ✨ 🎄');
  assert.equal(O.fallSpecs(14,gl,'2026-12-01').length,14);assert.equal(O.fallSpecs(26,gl,'2026-12-01').length,26);
  assert.equal(O.fallSpecs(999,gl,'k').length,40,'상한 40');assert.equal(O.fallSpecs(-3,gl,'k').length,0);
  assert.deepEqual(plain(O.fallSpecs(10,gl,'a')),plain(O.fallSpecs(10,gl,'a')));
  assert.deepEqual(plain(O.fallSpecs(10,[],'a')),[]);
  O.fallSpecs(26,gl,'z').forEach(f=>{assert.ok(gl.includes(f.g));assert.ok(f.left>=0&&f.left<100);assert.ok(f.size>=14&&f.size<=28);assert.ok(f.dur>=9&&f.dur<=17);});
  assert.equal(O.parseGlyphs('a b c d e f g h i j k').length,8);
  assert.deepEqual(plain(O.parseGlyphs('ok 너무너무너무너무길어요 ✨')),['ok','✨']);
  // 폰(low)은 14개·그 외 26개, 모션 줄이기면 층 자체를 만들지 않음
  assert.match(introSrc,/tier\.low\?14:26/);assert.match(introSrc,/if\(S\.tier\.reduced\)return ''/);
  assert.match(introSrc,/prefers-reduced-motion:reduce\)\{.*\.hi-fall\{display:none\}/);
});
test('화면 연결 계약: 점술관 모드는 three.js를 안 부르고 2D만 · animal 이면 옛 3D · 안전망(WebGL·CDN 실패 → 2D) 유지',()=>{
  const theme=introSrc.indexOf('if(S.theme){S.g=makeFallback'),three=introSrc.indexOf('import(THREE_URL)');
  assert.ok(theme>0&&three>theme,'theme 분기가 three 불러오기보다 먼저');
  assert.match(introSrc,/S\.g=makeFallback\(S,tier,true\)/);
  assert.match(introSrc,/introHero/);
  for(let n=0;n<=6;n++){assert.ok(fs.existsSync(path.join(root,'icons/intro/day'+n+'.glb')),'day'+n+'.glb');assert.ok(fs.existsSync(path.join(root,'icons/intro/day'+n+'.png')),'day'+n+'.png');}
});
test('상품권 추첨은 서버(fortune_draw)만 · 첫 화면 쪽은 추첨을 부르지 않고, 카드는 seed로 같은 카드',()=>{
  assert.ok(!/fortune_draw\b/.test(introSrc),'hub-intro.js는 추첨 함수를 직접 부르지 않음');
  assert.match(fortuneSrc,/rpc\(S\.ctx\.sb,'fortune_draw'\)/);
  assert.match(fortuneSrc,/ctx\.deckCard|S\.ctx\.deckCard/);
  assert.match(introSrc,/deckCard:S\.theme\?function\(seed\)\{return pickDeckCard\(S\.deck,seed\);\}:null/);
  const H=g.HubFortune._t,src={lines:'a\nb\nc',colors:'민트|#2fd9c4',items:'x',grades:'대길\n길\n중길\n소길\n보통'};
  assert.deepEqual(plain(H.buildCard(777,src)),plain(H.buildCard(777,src)));
});
test('사주 단추: 머리줄 도구 단추와 같은 방식(openToolFromHeader)으로 열고, 첫 화면은 생년월일을 받지 않는다',()=>{
  const hr=read('hr.html');
  assert.match(hr,/onOpenTool:code=>openToolFromHeader\(code\)/);
  assert.match(hr,/canOpenTool:code=>toolHeaderBtnVisible\(code\)/);
  assert.match(hr,/code:'saju'/);
  assert.match(introSrc,/data-saju/);assert.match(introSrc,/onOpenTool\('saju'\)/);
  assert.match(defOf('intro.oracle_saju_note'),/원내 기록/,'사주 도구가 입력을 원내 기록으로 저장함을 알림');
  assert.ok(!/type="date"|type=\\"date\\"|birth/i.test(introSrc),'첫 화면은 생년월일을 받지 않음');
  assert.match(introSrc,/tag==='SELECT'/,'띠·별자리 고르는 칸에서 Enter가 첫 화면을 닫지 않음');
});
test('띠·별자리 고른 값은 localStorage에만 저장(서버로 안 보냄)',()=>{
  assert.match(introSrc,/'hubIntro\.zodiac\.'\+\(S\.opts\.userId\|\|'me'\)/);
  assert.match(introSrc,/lsSet\(k,st\)/);
  // 서버 호출은 fortune_status·fortune_draws 읽기뿐 — 쓰기(insert/update/upsert)는 없음
  assert.ok(!/\.(insert|update|upsert|delete)\(/.test(introSrc));
  assert.match(introSrc,/\.eq\('user_id',S\.opts\.userId\)/,'도감은 본인 기록만(원장 계정이 전 직원 기록을 읽지 않게)');
});
test('캐시 키: hr.html의 hub-intro.js·hub-fortune.js ?v= 값이 올라갔고 불러오는 순서(fortune → intro)는 그대로',()=>{
  const hr=read('hr.html');
  const f=/hub-fortune\.js\?v=(\d{10})/.exec(hr),i=/hub-intro\.js\?v=(\d{10})/.exec(hr);
  assert.ok(f&&i);assert.ok(Number(f[1])>2026100601&&Number(i[1])>2026100503);
  assert.ok(hr.indexOf('hub-fortune.js')<hr.indexOf('hub-intro.js'));
});

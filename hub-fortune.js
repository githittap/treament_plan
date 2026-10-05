/* hub-fortune.js — 직원허브 첫 화면 「🔮 운세 카드」(하루 뽑기 + 확률 상품)
   · hub-intro.js 첫 화면의 단추로 열린다(HubFortune.open). 카드 뒤집기 → 서버(Supabase fortune_draw 함수)가 당첨을 정함 → 운세 한 장 + 당첨이면 상품 표시.
   · 운세 카드의 내용(한 줄 운세·행운의 색/아이템·등급 이름)과 모든 안내 글은 hub_ui_texts(키 intro.fortune_*)에 있어 원장이 「글 고치기」에서 고친다.
   · 상품 이름·금액·확률·개수(전체/월/일)·하루 횟수·켬끔은 원장이 카드 창의 「⚙️ 상품·확률 설정」에서 직접 고친다(DB fortune_prizes·fortune_settings — 코드에 박힌 값 없음).
   · 카드 모양(별 수·한 줄·색·숫자·아이템)은 서버가 준 seed로 정해 같은 날 어느 기기에서 열어도 같은 카드다. 당첨 여부는 서버가 정한 값만 믿는다(화면 난수 아님).
   · 글 목록(HUB_FORTUNE_TEXT_DEFS)은 hub-intro.js가 첫 화면 글 목록에 합쳐 「글 고치기」에 올린다. 이 파일은 hub-intro.js보다 먼저 불러온다.
*/
(function(root){
'use strict';

/* ── 글(기본값) — [키, 어디에 보이는지, 기본 글] ── */
const DEFS=[
  ['intro.fortune_chip','첫 화면 단추 — 오늘 아직 안 뽑았을 때','🔮 오늘의 운세 카드'],
  ['intro.fortune_chip_done','첫 화면 단추 — 오늘 이미 뽑았을 때','🔮 오늘의 운세 다시 보기'],
  ['intro.fortune_title','운세 카드 창 제목','🔮 오늘의 운세 카드'],
  ['intro.fortune_hint','카드를 뒤집기 전 안내','카드를 눌러 뒤집어 보세요 ✨'],
  ['intro.fortune_drawing','뒤집는 동안 글','카드를 읽는 중…'],
  ['intro.fortune_left','카드를 뽑은 뒤 남은 횟수 — {n}은 남은 횟수','오늘 {n}번 더 뽑을 수 있어요'],
  ['intro.fortune_again','한 번 더 뽑기 단추','🔄 한 번 더 뽑기'],
  ['intro.fortune_done','오늘 횟수를 다 썼을 때','오늘 운세는 여기까지예요. 내일 또 만나요!'],
  ['intro.fortune_stars','별점 앞 글','오늘의 운세 지수'],
  ['intro.fortune_color','행운의 색 앞 글','행운의 색'],
  ['intro.fortune_number','행운의 숫자 앞 글','행운의 숫자'],
  ['intro.fortune_item','행운의 아이템 앞 글','행운의 아이템'],
  ['intro.fortune_grades','운세 등급 이름 — 한 줄에 하나, 위에서부터 별 5개·4개·3개·2개·1개','대길 ✨\n길 😊\n중길 🙂\n소길 🍀\n보통 ☁️'],
  ['intro.fortune_lines','한 줄 운세 목록 — 한 줄에 하나(카드마다 이 중 하나가 나옴)',
    '오늘은 작은 친절 하나가 큰 행운으로 돌아오는 날이에요.\n뜻밖의 칭찬을 들을 수 있어요. 미리 웃을 준비!\n점심 메뉴에 행운이 따라요. 평소 안 먹던 걸 골라 보세요.\n서두르지 않아도 오늘은 일이 술술 풀려요.\n오후 세 시쯤 반가운 소식이 올지도 몰라요.\n동료와 눈을 마주치며 인사하면 행운이 두 배가 돼요.\n커피 한 잔의 여유가 오늘의 행운 스위치예요.\n막혔던 일이 의외의 곳에서 풀리는 날이에요.\n오늘 내가 한 일이 누군가에게 꼭 필요했던 일이에요.\n퇴근길에 예쁜 하늘을 만날 수 있어요. 한 번 올려다보세요.\n작은 정리정돈이 큰 여유를 만들어 줘요.\n오늘의 나는 평소보다 두 배쯤 반짝여요 ✨\n생각보다 일찍 끝나는 일이 있어요. 숨 돌릴 시간 확보!\n기분 좋은 우연이 슬쩍 다가와요. 놓치지 마세요.\n오늘은 "괜찮아요"가 마법의 주문이에요.\n맛있는 간식 운이 좋아요. 누가 나눠 줄지도?\n물 한 컵 마시면 운이 한 칸 올라가요 💧\n웃는 얼굴이 오늘의 부적이에요 😊\n새로운 아이디어가 번쩍! 메모해 두세요.\n부탁하면 흔쾌히 들어주는 사람이 많은 날이에요.\n마음먹은 일은 오늘 시작해도 좋아요.\n환자분의 "고맙습니다" 한마디가 오늘의 보너스예요.'],
  ['intro.fortune_colors','행운의 색 목록 — 한 줄에 하나, 「이름|#색번호」 모양(색번호는 없어도 됨)',
    '민트|#2fd9c4\n하늘색|#6fc3ff\n살구색|#ffb38a\n라벤더|#b9a4ff\n레몬 노랑|#ffe066\n코랄 핑크|#ff8fb8\n연두|#a8e063\n크림 흰색|#fff4dc\n남색|#3a4a9f\n금색|#ffc94a'],
  ['intro.fortune_items','행운의 아이템 목록 — 한 줄에 하나','텀블러\n볼펜\n손거울\n초콜릿\n에코백\n비타민\n이어폰\n양말\n작은 노트\n핸드크림\n립밤\n우산\n스티커\n머그컵'],
  ['intro.fortune_win_title','당첨됐을 때 큰 글 — {prize}는 상품 이름','🎉 {prize} 당첨!'],
  ['intro.fortune_themes','당첨 상품권 그림·색 — 한 줄에 하나, 「상품 이름에 들어갈 말(쉼표로 여러 개)|그림 이름|#색번호」. 위에서부터 먼저 맞는 줄을 씀. 그림 이름: coffee chicken cake pizza icecream snack movie gift',
    '커피,카페,아메리카노,라떼|coffee|#7a4a24\n치킨|chicken|#d9480f\n케이크,빵,베이커리,디저트,마카롱|cake|#d6336c\n피자|pizza|#c92a2a\n아이스크림,빙수|icecream|#0f9d7a\n편의점,과자,간식,초콜릿,음료|snack|#3b5bdb\n영화,팝콘,CGV,메가박스|movie|#c2255c'],
  ['intro.fortune_voucher_head','당첨 상품권 윗줄 글','🎁 GIFT VOUCHER · 상품권'],
  ['intro.fortune_voucher_foot','당첨 상품권 아랫줄 글','원장님께 이 화면을 보여 주세요'],
  ['intro.fortune_win_note','당첨됐을 때 안내 글','원장님이 직접 챙겨 드려요. 이 화면을 캡처해 두면 좋아요 📸'],
  ['intro.fortune_lose','당첨 상품이 없을 때 글','이번엔 선물이 없지만 행운은 가득! ✨'],
  ['intro.fortune_off','원장이 운세 카드를 꺼 두었을 때 글','운세 카드는 잠시 쉬는 중이에요.'],
  ['intro.fortune_error','카드를 못 뽑았을 때 글','지금은 카드를 못 뽑았어요. 잠시 뒤 다시 해 보세요.'],
  ['intro.fortune_mywins','내 당첨 내역 제목','내 당첨 내역'],
  ['intro.fortune_paid','당첨 내역에서 받은 것 표시','받음 ✔'],
  ['intro.fortune_unpaid','당첨 내역에서 아직 못 받은 것 표시','전달 대기'],
  ['intro.fortune_close','창 닫기 단추','닫기'],
  ['intro.fortune_admin','원장 전용 — 상품 설정 단추','⚙️ 상품·확률 설정']
];
root.HUB_FORTUNE_TEXT_DEFS=DEFS; // hub-intro.js가 첫 화면 글 목록에 합침 → 「글 고치기」에 보임

/* hub-fortune:test-start */
// seed(정수) → 같은 숫자면 같은 값이 나오는 난수(카드 모양을 정할 때만 씀 — 당첨과는 무관)
function mulberry32(seed){
  let a=(seed>>>0)||1;
  return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
}
function splitLines(text){return String(text==null?'':text).split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean);}
// 「이름|#색」 줄 → [{name,hex}]
function parseColors(text){
  return splitLines(text).map(function(l){
    const i=l.lastIndexOf('|');
    if(i<0)return {name:l,hex:''};
    const name=l.slice(0,i).trim(),hex=l.slice(i+1).trim();
    return {name:name||l,hex:/^#[0-9a-fA-F]{3,8}$/.test(hex)?hex:''};
  });
}
// 별 개수 뽑기 가중치(1~5개). 5개는 드물고 3~4개가 많다.
const STAR_WEIGHTS=[8,17,35,25,15];
function pickStars(r){
  const sum=STAR_WEIGHTS.reduce(function(a,b){return a+b;},0);let x=r*sum;
  for(let i=0;i<STAR_WEIGHTS.length;i++){x-=STAR_WEIGHTS[i];if(x<0)return i+1;}
  return 3;
}
// seed + 글 목록 → 카드 한 장
function buildCard(seed,src){
  const rnd=mulberry32(Number(seed)||1),lines=splitLines(src.lines),colors=parseColors(src.colors),items=splitLines(src.items),grades=splitLines(src.grades);
  const stars=pickStars(rnd());
  const pick=function(a){return a.length?a[Math.floor(rnd()*a.length)]:'';};
  return {stars:stars,grade:grades.length?grades[Math.min(grades.length-1,5-stars)]:'',line:pick(lines),color:pick(colors)||{name:'',hex:''},number:1+Math.floor(rnd()*99),item:pick(items)};
}
// 상품 이름 → 상품권 그림·색. 「키워드,키워드|그림|#색」 줄을 위에서부터 보고 이름에 키워드가 들어 있으면 그 줄을 쓴다. 없으면 금빛 선물상자.
const THEME_IMGS=['coffee','chicken','cake','pizza','icecream','snack','movie','gift'];
function pickTheme(text,name){
  const nm=String(name==null?'':name).toLowerCase(),def={img:'gift',color:'#c26a00'};
  const lines=splitLines(text);
  for(let i=0;i<lines.length;i++){
    const p=lines[i].split('|');if(p.length<2)continue;
    const keys=p[0].split(',').map(function(k){return k.trim().toLowerCase();}).filter(Boolean);
    if(!keys.some(function(k){return nm.indexOf(k)>=0;}))continue;
    const img=String(p[1]).trim().toLowerCase(),hex=String(p[2]||'').trim();
    return {img:/^[a-z0-9_-]{1,30}$/.test(img)?img:'gift',color:/^#[0-9a-fA-F]{3,8}$/.test(hex)?hex:def.color};
  }
  return def;
}
function fmtWon(n){const v=Math.round(Number(n)||0);return v.toLocaleString('ko-KR')+'원';}
// 오류 → 사람 글. 서버가 'invalid_prizes: 설명' 꼴로 주는 건 설명만 보인다.
function errMsg(e,fallback){
  const m=String((e&&e.message)||e||'');
  const i=m.indexOf(': ');
  if(i>0&&/^invalid_[a-z]+$/.test(m.slice(0,i)))return m.slice(i+2);
  if(m==='owner_only')return '원장만 고칠 수 있어요.';
  if(m==='not_allowed')return '허브 이용이 허용된 계정만 쓸 수 있어요.';
  if(m==='not_found')return '대상을 찾지 못했어요.';
  return fallback||'저장하지 못했어요. 잠시 뒤 다시 해 주세요.';
}
// 상품 입력 줄 → 서버로 보낼 목록. 빈 칸(개수)은 null=무제한.
function rowsToPayload(rows){
  const num=function(v){const s=String(v==null?'':v).trim();return s===''?null:Number(s);};
  return rows.map(function(r){
    return {id:r.id||null,name:String(r.name||'').trim(),amount_krw:num(r.amount_krw)==null?0:num(r.amount_krw),probability_pct:num(r.probability_pct),
      stock_total:num(r.stock_total),stock_monthly:num(r.stock_monthly),stock_daily:num(r.stock_daily),active:r.active!==false};
  });
}
// 켜 둔 상품 확률 합계(%) · 1회 평균 기대 지급액(원) · 월 상한이 모두 있을 때 월 최대 지급액
function prizeStats(rows){
  const act=rows.filter(function(r){return r.active!==false;});
  const n=function(v){const x=Number(String(v==null?'':v).trim());return isFinite(x)?x:0;};
  const sumPct=act.reduce(function(a,r){return a+n(r.probability_pct);},0);
  const expect=act.reduce(function(a,r){return a+n(r.probability_pct)/100*n(r.amount_krw);},0);
  const capped=act.length>0&&act.every(function(r){return String(r.stock_monthly==null?'':r.stock_monthly).trim()!==''||String(r.stock_total==null?'':r.stock_total).trim()!=='';});
  const monthlyMax=capped?act.reduce(function(a,r){
    const m=String(r.stock_monthly==null?'':r.stock_monthly).trim(),t=String(r.stock_total==null?'':r.stock_total).trim();
    const cap=m!==''&&t!==''?Math.min(n(m),n(t)):(m!==''?n(m):n(t));
    return a+cap*n(r.amount_krw);},0):null;
  return {sumPct:Math.round(sumPct*10000)/10000,expectPerDraw:Math.round(expect*100)/100,monthlyMax:monthlyMax};
}
/* hub-fortune:test-end */

/* ── 화면 ── */
const CSS=`
.hf-wrap{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(3,12,14,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;transition:opacity .25s;pointer-events:auto;font-family:inherit;color:#eafffb}
.hf-wrap.on{opacity:1}
.hf-panel{position:relative;width:min(420px,100%);max-height:calc(100dvh - 28px);overflow:auto;border:1px solid rgba(47,217,196,.35);border-radius:20px;background:linear-gradient(160deg,rgba(14,40,38,.97),rgba(8,20,30,.97));padding:18px 18px 16px;box-shadow:0 18px 60px rgba(0,0,0,.55),0 0 40px rgba(47,217,196,.12)}
.hf-panel.wide{width:min(860px,100%)}
.hf-h{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:17px;font-weight:700}
.hf-x{margin-left:auto;border:0;background:rgba(255,255,255,.08);color:#eafffb;border-radius:50%;width:30px;height:30px;font-size:16px;cursor:pointer}
.hf-x:hover{background:rgba(255,255,255,.18)}
.hf-stage{perspective:900px;display:flex;justify-content:center;margin:6px 0 10px}
.hf-card{position:relative;width:min(250px,64vw);aspect-ratio:3/4.4;transform-style:preserve-3d;transition:transform .9s cubic-bezier(.2,.8,.2,1);cursor:pointer;-webkit-tap-highlight-color:transparent}
.hf-card.flip{transform:rotateY(180deg)}
.hf-card.shake{animation:hf-shake .5s ease-in-out infinite}
.hf-card.idle{animation:hf-float 3.2s ease-in-out infinite}
@keyframes hf-float{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-7px) rotate(1deg)}}
@keyframes hf-shake{0%,100%{transform:rotate(0)}20%{transform:rotate(-5deg)}40%{transform:rotate(5deg)}60%{transform:rotate(-4deg)}80%{transform:rotate(4deg)}}
.hf-face{position:absolute;inset:0;border-radius:16px;backface-visibility:hidden;-webkit-backface-visibility:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:14px;text-align:center;overflow:hidden}
.hf-back{background:radial-gradient(circle at 30% 20%,#37d8c3 0,#155e63 38%,#0b2a3a 100%);border:2px solid rgba(255,255,255,.35);box-shadow:inset 0 0 40px rgba(255,255,255,.12)}
.hf-back::before{content:'';position:absolute;inset:0;background:radial-gradient(circle,rgba(255,255,255,.85) 0 1.2px,transparent 1.6px) 0 0/26px 26px,radial-gradient(circle,rgba(255,255,255,.5) 0 1px,transparent 1.4px) 13px 13px/26px 26px;opacity:.5;animation:hf-twinkle 2.4s ease-in-out infinite alternate}
@keyframes hf-twinkle{from{opacity:.25}to{opacity:.7}}
.hf-back img{position:relative;width:62%;filter:drop-shadow(0 6px 10px rgba(0,0,0,.4))}
.hf-front{transform:rotateY(180deg);background:linear-gradient(170deg,#fffaf0,#ffeccd 60%,#ffe0b0);color:#3b2a1a;border:2px solid #fff;box-shadow:inset 0 0 30px rgba(255,200,120,.35);justify-content:flex-start;gap:6px}
.hf-front.win{background:linear-gradient(170deg,#fff7c9,#ffe27a 55%,#ffc94a);box-shadow:inset 0 0 36px rgba(255,255,255,.6),0 0 30px rgba(255,201,74,.7)}
.hf-grade{font-size:22px;font-weight:800;letter-spacing:.02em}
.hf-starrow{font-size:19px;letter-spacing:2px;color:#f5a623}
.hf-starrow i{font-style:normal;opacity:.25}
.hf-starlbl{font-size:11px;opacity:.65}
.hf-line{font-size:14.5px;line-height:1.5;font-weight:600;margin:4px 0;word-break:keep-all}
.hf-animal{flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center}
.hf-animal img{max-height:100%;max-width:52%;object-fit:contain;filter:drop-shadow(0 4px 6px rgba(80,50,10,.35))}
.hf-lucky{display:grid;grid-template-columns:auto 1fr;gap:3px 8px;font-size:12px;text-align:left;margin-top:auto;width:100%}
.hf-lucky b{opacity:.65;font-weight:600}
.hf-sw{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:5px;vertical-align:-1px;border:1px solid rgba(0,0,0,.25)}
.hf-voucher{--vc:#c26a00;position:relative;width:100%;border-radius:10px;background:linear-gradient(135deg,#fff,#fff6dc);color:#8a4b00;padding:7px 10px 6px;box-shadow:0 2px 8px rgba(160,90,0,.3);border:1.5px dashed var(--vc);text-align:center;-webkit-mask:radial-gradient(circle 6px at 0 50%,transparent 98%,#000) left/51% 100% no-repeat,radial-gradient(circle 6px at 100% 50%,transparent 98%,#000) right/51% 100% no-repeat;mask:radial-gradient(circle 6px at 0 50%,transparent 98%,#000) left/51% 100% no-repeat,radial-gradient(circle 6px at 100% 50%,transparent 98%,#000) right/51% 100% no-repeat}
.hf-vhead{font-size:9.5px;letter-spacing:.12em;font-weight:700;opacity:.7}
.hf-vbody{display:flex;align-items:center;gap:8px;margin-top:3px;text-align:left}
.hf-vbody img{width:46px;height:46px;object-fit:contain;flex:none}
.hf-vtxt{flex:1;min-width:0;text-align:center}
.hf-vname{font-size:14px;font-weight:800;margin-top:2px;word-break:keep-all;color:var(--vc)}
.hf-vamt{font-size:21px;font-weight:900;color:var(--vc);line-height:1.15;margin-top:1px}
.hf-vfoot{font-size:9.5px;opacity:.65;margin-top:3px;border-top:1px dashed rgba(160,90,0,.35);padding-top:3px}
.hf-msg{text-align:center;font-size:14px;line-height:1.5;min-height:21px;margin:2px 0 6px}
.hf-win-title{font-size:19px;font-weight:800;color:#ffe27a;text-shadow:0 0 12px rgba(255,201,74,.6)}
.hf-sub{font-size:12px;opacity:.75}
.hf-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:8px}
.hf-btn{border:1px solid rgba(47,217,196,.45);background:rgba(47,217,196,.14);color:#eafffb;border-radius:999px;padding:7px 14px;font:inherit;font-size:13px;cursor:pointer}
.hf-btn:hover{background:rgba(47,217,196,.3)}
.hf-btn:disabled{opacity:.45;cursor:default}
.hf-btn.pri{background:#2fd9c4;color:#04242a;font-weight:700;border-color:#2fd9c4}
.hf-btn.warn{border-color:rgba(255,120,120,.6);background:rgba(255,100,100,.14)}
.hf-wins{margin-top:10px;border-top:1px solid rgba(255,255,255,.12);padding-top:8px;font-size:12px}
.hf-wins h4{margin:0 0 4px;font-size:12px;opacity:.75;font-weight:600}
.hf-wins div{display:flex;gap:8px;padding:2px 0}
.hf-wins div span:last-child{margin-left:auto;opacity:.8}
.hf-spark{position:absolute;pointer-events:none;border-radius:50%;z-index:5;animation:hf-spark 1.1s ease-out forwards}
@keyframes hf-spark{from{opacity:1;transform:translate(0,0) scale(1)}to{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.2)}}
.hf-sec{border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px;margin:0 0 10px;background:rgba(255,255,255,.03)}
.hf-sec h4{margin:0 0 8px;font-size:13.5px}
.hf-form{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;font-size:13px}
.hf-form input[type=number],.hf-form input[type=text],.hf-form select{background:rgba(0,0,0,.35);color:#eafffb;border:1px solid rgba(255,255,255,.22);border-radius:8px;padding:5px 7px;font:inherit;font-size:13px}
.hf-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.hf-tbl th{font-weight:600;opacity:.7;text-align:left;padding:3px 4px;white-space:nowrap}
.hf-tbl td{padding:3px 4px;vertical-align:middle}
.hf-tbl input[type=text]{width:100%;min-width:90px}
.hf-tbl input[type=number]{width:78px}
.hf-tbl .sm input[type=number]{width:62px}
.hf-use{font-size:11px;opacity:.65;white-space:nowrap}
.hf-hint{font-size:11.5px;opacity:.7;line-height:1.5;margin:6px 0 0}
.hf-ok{color:#7dffb0}.hf-bad{color:#ff9a9a}
.hf-list div{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:12.5px}
.hf-list div span.g{margin-left:auto}
@media (max-width:640px){
  .hf-tbl thead{display:none}
  .hf-tbl tr{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.12)}
  .hf-tbl td{display:block}
  .hf-tbl td.nm{grid-column:1/3}
  .hf-tbl input[type=number],.hf-tbl .sm input[type=number]{width:100%}
  .hf-tbl td::before{content:attr(data-l);display:block;font-size:10.5px;opacity:.6}
  .hf-tbl td.nm::before{content:''}
}
@media (prefers-reduced-motion:reduce){.hf-card.idle,.hf-back::before,.hf-card.shake{animation:none}.hf-card{transition:transform .01s}}
`;
function injectCss(){
  if(typeof document==='undefined'||document.getElementById('hubFortuneCss'))return;
  const s=document.createElement('style');s.id='hubFortuneCss';s.textContent=CSS;document.head.appendChild(s);
}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function rpc(sb,fn,args){return sb.rpc(fn,args||{}).then(function(r){if(r.error)throw r.error;return r.data;});}

let CUR=null; // 열려 있는 창 하나만

/* ctx = {sb, host(요소), T(key,vars), isOwner, day, animalSrc, celebrate(level), onOpen(), onClose(), onDrawn(state)} */
function open(ctx){
  if(CUR)return CUR;
  injectCss();
  const T=ctx.T;
  const S={ctx:ctx,state:null,busy:false,card:null,last:null,timers:[]};
  CUR=S;
  const wrap=document.createElement('div');wrap.className='hf-wrap';wrap.setAttribute('role','dialog');wrap.setAttribute('aria-label',T('intro.fortune_title'));
  S.wrap=wrap;
  (ctx.host||document.body).appendChild(wrap);
  requestAnimationFrame(function(){wrap.classList.add('on');});
  if(ctx.onOpen)ctx.onOpen();
  S.keyFn=function(e){
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
    else if(e.key==='Enter'||e.key===' '){const t=e.target;if(t&&t.tagName==='BUTTON')return;if(S.panelKind==='card'){e.preventDefault();e.stopPropagation();flip();}}
  };
  document.addEventListener('keydown',S.keyFn,true);
  wrap.addEventListener('click',function(e){if(e.target===wrap)close();});
  renderLoading();
  refresh().then(renderCard,function(){renderMsg(T('intro.fortune_error'));});
  return S;
}
function close(){
  const S=CUR;if(!S)return;
  CUR=null;
  S.timers.forEach(clearTimeout);
  document.removeEventListener('keydown',S.keyFn,true);
  S.wrap.classList.remove('on');
  setTimeout(function(){if(S.wrap.parentNode)S.wrap.parentNode.removeChild(S.wrap);},260);
  if(S.ctx.onClose)S.ctx.onClose(S.state);
}
function refresh(){
  const S=CUR;
  return rpc(S.ctx.sb,'fortune_status').then(function(st){S.state=st;if(st.today&&st.today.length)S.last=st.today[st.today.length-1];return st;});
}
function cardSrc(S){const T=S.ctx.T;return {lines:T('intro.fortune_lines'),colors:T('intro.fortune_colors'),items:T('intro.fortune_items'),grades:T('intro.fortune_grades')};}
function panel(S,html,wide){
  S.wrap.innerHTML='<div class="hf-panel'+(wide?' wide':'')+'">'+html+'</div>';
  const x=S.wrap.querySelector('.hf-x');if(x)x.addEventListener('click',close);
  return S.wrap.firstChild;
}
function head(S,title,extra){return '<div class="hf-h"><span>'+esc(title)+'</span>'+(extra||'')+'<button type="button" class="hf-x" aria-label="'+esc(S.ctx.T('intro.fortune_close'))+'">✕</button></div>';}
function renderLoading(){const S=CUR;S.panelKind='load';panel(S,head(S,S.ctx.T('intro.fortune_title'))+'<div class="hf-msg">…</div>');}
function renderMsg(text){
  const S=CUR;if(!S)return;S.panelKind='msg';
  const p=panel(S,head(S,S.ctx.T('intro.fortune_title'))+'<div class="hf-msg">'+esc(text)+'</div>'+(S.ctx.isOwner?'<div class="hf-row"><button type="button" class="hf-btn" data-admin>'+esc(S.ctx.T('intro.fortune_admin'))+'</button></div>':''));
  const a=p.querySelector('[data-admin]');if(a)a.addEventListener('click',renderAdmin);
}
function starsHtml(n){let h='';for(let i=1;i<=5;i++)h+=i<=n?'★':'<i>★</i>';return h;}
function faceHtml(S,draw){
  const T=S.ctx.T,c=buildCard(draw.seed,cardSrc(S)),win=!!draw.prize_name;
  const sw=c.color.hex?'<span class="hf-sw" style="background:'+esc(c.color.hex)+'"></span>':'';
  return '<div class="hf-grade">'+esc(c.grade)+'</div>'
    +'<div class="hf-starrow" aria-label="'+esc(T('intro.fortune_stars'))+' '+c.stars+'">'+starsHtml(c.stars)+'</div>'
    +'<div class="hf-starlbl">'+esc(T('intro.fortune_stars'))+'</div>'
    +'<div class="hf-line">'+esc(c.line)+'</div>'
    +(S.ctx.animalSrc?'<div class="hf-animal"><img src="'+esc(S.ctx.animalSrc)+'" alt="" onerror="this.style.display=\'none\'"></div>':'')
    +(win?voucherHtml(T,draw):'')
    +'<div class="hf-lucky"><b>'+esc(T('intro.fortune_color'))+'</b><span>'+sw+esc(c.color.name)+'</span><b>'+esc(T('intro.fortune_number'))+'</b><span>'+c.number+'</span><b>'+esc(T('intro.fortune_item'))+'</b><span>'+esc(c.item)+'</span></div>';
}
function voucherHtml(T,draw){
  const th=pickTheme(T('intro.fortune_themes'),draw.prize_name);
  return '<div class="hf-voucher" style="--vc:'+esc(th.color)+'"><div class="hf-vhead">'+esc(T('intro.fortune_voucher_head'))+'</div>'
    +'<div class="hf-vbody"><img src="icons/fortune/'+esc(th.img)+'.png" alt="" onerror="this.style.display=\'none\'"><div class="hf-vtxt"><div class="hf-vname">'+esc(draw.prize_name)+'</div>'
    +(Number(draw.prize_amount_krw)>0?'<div class="hf-vamt">'+esc(fmtWon(draw.prize_amount_krw))+'</div>':'')+'</div></div>'
    +'<div class="hf-vfoot">'+esc(T('intro.fortune_voucher_foot'))+'</div></div>';
}
function winsHtml(S){
  const T=S.ctx.T,w=(S.state&&S.state.wins)||[];
  if(!w.length)return '';
  return '<div class="hf-wins"><h4>'+esc(T('intro.fortune_mywins'))+'</h4>'+w.map(function(x){
    return '<div><span>'+esc(String(x.draw_date).slice(5))+'</span><span>'+esc(x.prize_name)+(Number(x.prize_amount_krw)>0?' · '+esc(fmtWon(x.prize_amount_krw)):'')+'</span><span>'+esc(x.paid?T('intro.fortune_paid'):T('intro.fortune_unpaid'))+'</span></div>';}).join('')+'</div>';
}
function renderCard(){
  const S=CUR;if(!S)return;
  const T=S.ctx.T,st=S.state;
  if(!st.enabled){renderMsg(T('intro.fortune_off'));return;}
  S.panelKind='card';
  const left=Math.max(0,st.draws_per_day-st.used_today),drawn=S.last;
  const p=panel(S,head(S,T('intro.fortune_title'))
    +'<div class="hf-stage"><div class="hf-card'+(drawn?' flip':' idle')+'" tabindex="0" role="button" aria-label="'+esc(T('intro.fortune_hint'))+'">'
    +'<div class="hf-face hf-back"><img src="'+esc(S.ctx.animalSrc||'')+'" alt="" onerror="this.style.display=\'none\'"></div>'
    +'<div class="hf-face hf-front'+(drawn&&drawn.prize_name?' win':'')+'">'+(drawn?faceHtml(S,drawn):'')+'</div></div></div>'
    +'<div class="hf-msg" data-msg></div>'
    +'<div class="hf-row" data-row></div>'
    +winsHtml(S));
  S.cardEl=p.querySelector('.hf-card');
  S.msgEl=p.querySelector('[data-msg]');S.rowEl=p.querySelector('[data-row]');
  S.cardEl.addEventListener('click',flip);
  if(drawn)afterReveal(S,drawn,true);else S.msgEl.textContent=T('intro.fortune_hint');
  fillRow(S,left);
}
function fillRow(S,left){
  const T=S.ctx.T;let h='';
  if(S.last&&left>0)h+='<button type="button" class="hf-btn pri" data-again>'+esc(T('intro.fortune_again'))+'</button>';
  if(S.ctx.isOwner)h+='<button type="button" class="hf-btn" data-admin>'+esc(T('intro.fortune_admin'))+'</button>';
  S.rowEl.innerHTML=h;
  const a=S.rowEl.querySelector('[data-again]');if(a)a.addEventListener('click',again);
  const m=S.rowEl.querySelector('[data-admin]');if(m)m.addEventListener('click',renderAdmin);
}
function sparkle(S,count,colors){
  const stage=S.wrap.querySelector('.hf-stage');if(!stage)return;
  const r=stage.getBoundingClientRect(),pr=S.wrap.getBoundingClientRect();
  for(let i=0;i<count;i++){
    const d=document.createElement('span');d.className='hf-spark';
    const sz=4+Math.random()*7,a=Math.random()*Math.PI*2,dist=60+Math.random()*130;
    d.style.cssText='width:'+sz+'px;height:'+sz+'px;left:'+(r.left-pr.left+r.width/2)+'px;top:'+(r.top-pr.top+r.height/2)+'px;background:'+colors[i%colors.length]+';--dx:'+(Math.cos(a)*dist).toFixed(0)+'px;--dy:'+(Math.sin(a)*dist-30).toFixed(0)+'px;box-shadow:0 0 8px '+colors[i%colors.length];
    S.wrap.appendChild(d);
    S.timers.push(setTimeout(function(){if(d.parentNode)d.parentNode.removeChild(d);},1200));
  }
}
function afterReveal(S,draw,quiet){
  const T=S.ctx.T,left=Math.max(0,S.state.draws_per_day-S.state.used_today);
  if(draw.prize_name){
    S.msgEl.innerHTML='<div class="hf-win-title">'+esc(T('intro.fortune_win_title',{prize:draw.prize_name}))+'</div><div class="hf-sub">'+esc(T('intro.fortune_win_note'))+'</div>';
  }else{
    S.msgEl.textContent=T('intro.fortune_lose')+(left>0?'':' '+T('intro.fortune_done'));
    if(draw.prize_name==null&&left>0)S.msgEl.textContent=T('intro.fortune_lose')+' · '+T('intro.fortune_left',{n:left});
  }
  if(draw.prize_name&&left>0)S.msgEl.innerHTML+='<div class="hf-sub">'+esc(T('intro.fortune_left',{n:left}))+'</div>';
  if(!quiet){
    if(draw.prize_name){sparkle(S,46,['#ffe27a','#ffc94a','#fff','#ff8fb8','#6fc3ff']);if(S.ctx.celebrate)S.ctx.celebrate(2);}
    else{sparkle(S,16,['#2fd9c4','#fff','#b9a4ff']);if(S.ctx.celebrate)S.ctx.celebrate(1);}
  }
}
function flip(){
  const S=CUR;if(!S||S.busy||S.panelKind!=='card')return;
  if(S.cardEl.classList.contains('flip'))return;
  const left=S.state.draws_per_day-S.state.used_today;
  if(left<=0){S.msgEl.textContent=S.ctx.T('intro.fortune_done');return;}
  S.busy=true;
  S.cardEl.classList.remove('idle');S.cardEl.classList.add('shake');
  S.msgEl.textContent=S.ctx.T('intro.fortune_drawing');
  const started=Date.now();
  rpc(S.ctx.sb,'fortune_draw').then(function(r){
    const wait=Math.max(0,700-(Date.now()-started));
    S.timers.push(setTimeout(function(){
      if(CUR!==S)return;
      S.busy=false;S.cardEl.classList.remove('shake');
      if(!r||!r.ok){
        if(r&&r.reason==='disabled'){renderMsg(S.ctx.T('intro.fortune_off'));return;}
        S.msgEl.textContent=S.ctx.T('intro.fortune_done');S.cardEl.classList.add('idle');refresh().then(renderCard,function(){});return;
      }
      S.last={draw_no:r.draw_no,seed:r.seed,prize_name:r.prize_name,prize_amount_krw:r.prize_amount_krw};
      S.state.used_today=r.used_today;S.state.draws_per_day=r.draws_per_day;
      if(r.prize_name){S.state.wins=[{draw_date:new Date(Date.now()+9*3600*1000).toISOString().slice(0,10),prize_name:r.prize_name,prize_amount_krw:r.prize_amount_krw,paid:false}].concat(S.state.wins||[]).slice(0,10);}
      S.wrap.querySelector('.hf-front').innerHTML=faceHtml(S,S.last);
      S.wrap.querySelector('.hf-front').classList.toggle('win',!!r.prize_name);
      S.cardEl.classList.add('flip');
      S.timers.push(setTimeout(function(){if(CUR!==S)return;afterReveal(S,S.last,false);fillRow(S,Math.max(0,r.draws_per_day-r.used_today));if(S.ctx.onDrawn)S.ctx.onDrawn(S.state);},520));
    },wait));
  },function(){
    S.busy=false;S.cardEl.classList.remove('shake');S.cardEl.classList.add('idle');
    S.msgEl.textContent=S.ctx.T('intro.fortune_error');
  });
}
function again(){
  const S=CUR;if(!S||S.busy)return;
  S.last=null;
  renderCard(); // 새 카드(뒷면)로 — 남은 횟수가 있을 때만 이 단추가 보임
  setTimeout(flip,0);
}

/* ── 원장 설정 창 ── */
function renderAdmin(){
  const S=CUR;if(!S)return;
  S.panelKind='admin';
  panel(S,head(S,'⚙️ 상품·확률 설정')+'<div class="hf-msg">불러오는 중…</div>',true);
  rpc(S.ctx.sb,'fortune_admin_overview').then(function(ov){if(CUR===S)drawAdmin(S,ov);},function(e){
    const p=panel(S,head(S,'⚙️')+'<div class="hf-msg hf-bad">'+esc(errMsg(e,'불러오지 못했어요. 운영 DB에 운세 카드 표가 아직 없을 수 있어요.'))+'</div><div class="hf-row"><button type="button" class="hf-btn" data-back>돌아가기</button></div>',true);
    p.querySelector('[data-back]').addEventListener('click',function(){refresh().then(renderCard,function(){renderMsg(S.ctx.T('intro.fortune_error'));});});
  });
}
function drawAdmin(S,ov){
  S.ov=ov;
  const rows=ov.prizes.map(function(p){return {id:p.id,name:p.name,amount_krw:p.amount_krw,probability_pct:p.probability_pct,stock_total:p.stock_total==null?'':p.stock_total,stock_monthly:p.stock_monthly==null?'':p.stock_monthly,stock_daily:p.stock_daily==null?'':p.stock_daily,active:p.active,used_total:p.used_total,used_month:p.used_month,used_today:p.used_today};});
  S.rows=rows;
  const t=ov.totals||{};
  const p=panel(S,head(S,'⚙️ 상품·확률 설정')
    +'<div class="hf-sec"><h4>기본 설정</h4><div class="hf-form">'
    +'<label>운세 카드 <select data-en><option value="true"'+(ov.enabled?' selected':'')+'>켬</option><option value="false"'+(ov.enabled?'':' selected')+'>끔</option></select></label>'
    +'<label>한 사람 하루 뽑기 횟수 <input type="number" data-per min="1" max="20" value="'+esc(ov.draws_per_day)+'"> 번</label>'
    +'<button type="button" class="hf-btn" data-save-set>저장</button><span data-set-msg class="hf-sub"></span></div></div>'
    +'<div class="hf-sec"><h4>상품 목록 <span class="hf-sub">— 칸을 고치고 맨 아래 「상품 저장」을 눌러요</span></h4>'
    +'<table class="hf-tbl"><thead><tr><th>상품 이름</th><th>금액(원)</th><th>당첨 확률(%)</th><th>전체 개수</th><th>한 달 개수</th><th>하루 개수</th><th>켬</th><th></th></tr></thead><tbody data-body></tbody></table>'
    +'<div class="hf-row" style="justify-content:flex-start"><button type="button" class="hf-btn" data-add>＋ 상품 추가</button><button type="button" class="hf-btn pri" data-save>상품 저장</button><span data-msg class="hf-sub"></span></div>'
    +'<div class="hf-hint" data-stat></div>'
    +'<div class="hf-hint">개수를 비워 두면 무제한이에요. 확률은 한 번 뽑을 때 그 상품이 나올 가능성이에요(예 0.5 = 200번에 1번 꼴). 켜 둔 상품의 확률을 다 더해 100을 넘으면 저장되지 않아요. 개수가 다 찬 상품은 자동으로 안 나와요.</div></div>'
    +'<div class="hf-sec"><h4>이번 달 현황</h4><div class="hf-sub">뽑은 횟수 '+esc(t.draws_month||0)+' · 당첨 '+esc(t.wins_month||0)+'건 · 당첨 금액 합계 '+esc(fmtWon(t.amount_month_krw||0))+' · 아직 전달 안 한 당첨 '+esc(t.unpaid_count||0)+'건('+esc(fmtWon(t.unpaid_krw||0))+')</div></div>'
    +'<div class="hf-sec"><h4>최근 당첨 내역 <span class="hf-sub">— 상품을 전해 준 뒤 「전달함」을 눌러 표시해요</span></h4><div class="hf-list" data-list></div></div>'
    +'<div class="hf-row"><button type="button" class="hf-btn" data-back>← 카드로 돌아가기</button></div>',true);
  S.adminEl=p;
  drawRows(S);drawList(S);
  p.querySelector('[data-back]').addEventListener('click',function(){refresh().then(renderCard,function(){renderMsg(S.ctx.T('intro.fortune_error'));});});
  p.querySelector('[data-add]').addEventListener('click',function(){S.rows.push({id:null,name:'',amount_krw:'',probability_pct:'',stock_total:'',stock_monthly:'',stock_daily:'',active:true});drawRows(S);});
  p.querySelector('[data-save]').addEventListener('click',function(){saveRows(S);});
  p.querySelector('[data-save-set]').addEventListener('click',function(){
    const m=p.querySelector('[data-set-msg]');m.textContent='저장 중…';m.className='hf-sub';
    rpc(S.ctx.sb,'fortune_save_settings',{p_enabled:p.querySelector('[data-en]').value==='true',p_draws_per_day:Number(p.querySelector('[data-per]').value)}).then(function(){m.textContent='저장했어요.';m.className='hf-sub hf-ok';},function(e){m.textContent=errMsg(e);m.className='hf-sub hf-bad';});
  });
}
function readRows(S){
  S.adminEl.querySelectorAll('tr[data-i]').forEach(function(tr){
    const r=S.rows[Number(tr.getAttribute('data-i'))];if(!r)return;
    tr.querySelectorAll('[data-f]').forEach(function(inp){const f=inp.getAttribute('data-f');r[f]=inp.type==='checkbox'?inp.checked:inp.value;});
  });
}
function drawRows(S){
  const body=S.adminEl.querySelector('[data-body]');
  const use=function(r){return r.id?'<div class="hf-use">쓴 개수 — 전체 '+esc(r.used_total||0)+' · 이번 달 '+esc(r.used_month||0)+' · 오늘 '+esc(r.used_today||0)+'</div>':'';};
  body.innerHTML=S.rows.length?S.rows.map(function(r,i){
    return '<tr data-i="'+i+'"><td class="nm" data-l="상품 이름"><input type="text" data-f="name" maxlength="60" placeholder="예: 커피 쿠폰" value="'+esc(r.name)+'">'+use(r)+'</td>'
      +'<td data-l="금액(원)"><input type="number" data-f="amount_krw" min="0" max="10000000" step="100" value="'+esc(r.amount_krw)+'"></td>'
      +'<td data-l="확률(%)"><input type="number" data-f="probability_pct" min="0" max="100" step="0.01" value="'+esc(r.probability_pct)+'"></td>'
      +'<td class="sm" data-l="전체 개수"><input type="number" data-f="stock_total" min="0" step="1" placeholder="무제한" value="'+esc(r.stock_total)+'"></td>'
      +'<td class="sm" data-l="한 달 개수"><input type="number" data-f="stock_monthly" min="0" step="1" placeholder="무제한" value="'+esc(r.stock_monthly)+'"></td>'
      +'<td class="sm" data-l="하루 개수"><input type="number" data-f="stock_daily" min="0" step="1" placeholder="무제한" value="'+esc(r.stock_daily)+'"></td>'
      +'<td data-l="켬"><input type="checkbox" data-f="active"'+(r.active!==false?' checked':'')+'></td>'
      +'<td><button type="button" class="hf-btn warn" data-del="'+i+'">삭제</button></td></tr>';}).join('')
    :'<tr><td colspan="8" class="hf-sub">상품이 없어요. 「＋ 상품 추가」로 만들면 돼요. 상품이 없으면 카드는 운세만 보여 줘요.</td></tr>';
  body.querySelectorAll('[data-del]').forEach(function(b){b.addEventListener('click',function(){readRows(S);S.rows.splice(Number(b.getAttribute('data-del')),1);drawRows(S);});});
  body.querySelectorAll('[data-f]').forEach(function(inp){inp.addEventListener('input',function(){readRows(S);showStat(S);});inp.addEventListener('change',function(){readRows(S);showStat(S);});});
  showStat(S);
}
function showStat(S){
  const el=S.adminEl.querySelector('[data-stat]');if(!el)return;
  const st=prizeStats(S.rows),over=st.sumPct>100;
  el.innerHTML='켜 둔 상품 확률 합계 <b class="'+(over?'hf-bad':'hf-ok')+'">'+st.sumPct+'%</b>'+(over?' — 100%를 넘으면 저장되지 않아요':'')
    +' · 한 번 뽑을 때 평균 지급액 약 '+esc(fmtWon(st.expectPerDraw))
    +(st.monthlyMax==null?' · (모든 상품에 개수 한도를 두면 한 달 최대 지급액도 계산해 드려요)':' · 개수 한도로 본 한 달 최대 지급액 '+esc(fmtWon(st.monthlyMax)));
}
function saveRows(S){
  readRows(S);
  const m=S.adminEl.querySelector('[data-msg]');m.textContent='저장 중…';m.className='hf-sub';
  rpc(S.ctx.sb,'fortune_save_prizes',{p_prizes:rowsToPayload(S.rows)}).then(function(){
    m.textContent='저장했어요.';m.className='hf-sub hf-ok';
    rpc(S.ctx.sb,'fortune_admin_overview').then(function(ov){if(CUR===S){const msgKeep='저장했어요.';drawAdmin(S,ov);const mm=S.adminEl.querySelector('[data-msg]');mm.textContent=msgKeep;mm.className='hf-sub hf-ok';}},function(){});
  },function(e){m.textContent=errMsg(e);m.className='hf-sub hf-bad';});
}
function drawList(S){
  const box=S.adminEl.querySelector('[data-list]'),rec=(S.ov&&S.ov.recent)||[];
  if(!rec.length){box.innerHTML='<div class="hf-sub">아직 당첨 내역이 없어요.</div>';return;}
  box.innerHTML=rec.map(function(x){
    return '<div data-id="'+esc(x.id)+'"><span>'+esc(String(x.draw_date).slice(5))+'</span><span><b>'+esc(x.name)+'</b></span><span>'+esc(x.prize_name)+(Number(x.prize_amount_krw)>0?' · '+esc(fmtWon(x.prize_amount_krw)):'')+'</span>'
      +'<span class="g"><button type="button" class="hf-btn" data-paid="'+esc(x.id)+'" data-v="'+(x.paid?'0':'1')+'">'+(x.paid?'전달함 ✔ (취소)':'전달함으로 표시')+'</button></span></div>';}).join('');
  box.querySelectorAll('[data-paid]').forEach(function(b){b.addEventListener('click',function(){
    b.disabled=true;
    rpc(S.ctx.sb,'fortune_mark_paid',{p_draw_id:Number(b.getAttribute('data-paid')),p_paid:b.getAttribute('data-v')==='1'}).then(function(){
      return rpc(S.ctx.sb,'fortune_admin_overview');
    }).then(function(ov){if(CUR!==S)return;S.ov=ov;drawList(S);},function(e){b.disabled=false;b.textContent=errMsg(e);});
  });});
}

root.HubFortune={open:open,close:close,isOpen:function(){return !!CUR;},defs:DEFS,
  _t:{mulberry32:mulberry32,splitLines:splitLines,parseColors:parseColors,pickStars:pickStars,buildCard:buildCard,fmtWon:fmtWon,errMsg:errMsg,rowsToPayload:rowsToPayload,prizeStats:prizeStats,pickTheme:pickTheme}};
})(typeof window!=='undefined'?window:globalThis);

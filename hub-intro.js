/* hub-intro.js — 직원허브 첫 화면(요일별 3D 동물 + 파티클 + 오늘 정보 + 미니게임)
   · hr.html이 로그인 직후 HubIntro.show(옵션)으로 띄운다. 「허브 들어가기」를 누르면 3D를 완전히 끄고(그래픽 메모리 반환) 밑에 그려 둔 원래 허브가 보인다.
   · 화면 글은 전부 hub_ui_texts 표(키 intro.*). 원장은 첫 화면 오른쪽 위 「✏️ 문구 고치기」나 ⚙️ 허브 설정 › 글 고치기에서 고친다.
     글 목록(HUB_INTRO_TEXT_DEFS)은 hub-texts.js가 읽어 「글 고치기」 목록에도 올린다.
   · three.js는 첫 화면을 띄울 때만 불러온다. 못 불러오거나 WebGL이 없으면 가벼운 2D 파티클로 대신한다(허브는 절대 막지 않음).
   · 다른 탭으로 가면(화면 숨김) 그리기를 멈춘다. 폰·느린 기기는 파티클 수·해상도를 낮추고, 프레임이 떨어지면 스스로 더 낮춘다.
   · 가운데 3D는 오늘 요일 동물(icons/intro/dayN.glb, N=getDay 0일~6토). 처음엔 빛 알갱이가 그 동물 그림(dayN.png) 모양으로 모였다가 3D가 나온다.
     아래 요일 단추로 다른 요일 동물을 볼 수 있다(그때만 그 GLB를 불러옴). 동물을 누르면 점프 + 하트·별 + 말풍선(intro.dayN_say).
*/
(function(root){
'use strict';
const THREE_URL='https://cdn.jsdelivr.net/npm/three@0.169.0/+esm';
const GLTF_URL='https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/loaders/GLTFLoader.js/+esm'; // 위 three를 같이 씀(REVISION 169)
const LOGO_URL='icons/jp-logo-h-white.png';
/* 요일(getDay 번호) — 그림·3D 파일과 배경·후광·불꽃 색 */
const DAY_COLORS=['#ffb38a','#b9a4ff','#ff9f43','#ff8fb8','#5fe0b0','#ffc94a','#6fc3ff'];
const DAY_ORDER=[1,2,3,4,5,6,0]; // 단추 순서 월~일
const dayPng=function(n){return 'icons/intro/day'+n+'.png';};
const dayGlb=function(n){return 'icons/intro/day'+n+'.glb';};
const ANIMAL_YAW=-1.15; // 3D 동물이 그림과 같은 3/4 정면을 보는 각도
function todayN(){
  let f=null;try{f=new URLSearchParams(location.search).get('introDay');}catch(e){}
  if(f!=null&&/^[0-6]$/.test(f))return Number(f);
  return new Date().getDay();
}
function hexRgb(h){const v=parseInt(String(h).slice(1),16);return [(v>>16&255)/255,(v>>8&255)/255,(v&255)/255];}

/* ── 글(기본값) — [키, 어디에 보이는지, 기본 글] ── */
const DEFS=[
  ['intro.show_mode','첫 화면을 띄우는 횟수 — daily(하루 한 번)·always(들어올 때마다)·off(안 띄움) 중 하나','daily'],
  ['intro.brand','맨 위 병원 이름 옆 작은 글(로고 그림 밑)','ASAN JUNG PLANT DENTAL CLINIC'],
  ['intro.slogan','맨 위 슬로건','당일 치료, 평생 건강한 치아'],
  ['intro.greet_morning','아침(5~11시) 큰 인사 — {name}은 직원 이름','{name}님, 좋은 아침이에요 ☀️'],
  ['intro.greet_noon','낮(11~17시) 큰 인사 — {name}은 직원 이름','{name}님, 오늘도 힘내요 💪'],
  ['intro.greet_evening','저녁(17~22시) 큰 인사 — {name}은 직원 이름','{name}님, 오늘도 수고 많았어요 🌙'],
  ['intro.greet_night','밤(22~5시) 큰 인사 — {name}은 직원 이름','{name}님, 늦게까지 고마워요 ✨'],
  ['intro.sub','큰 인사 아래 작은 글','정을 나누는 치과 · 정성으로 꼼꼼히'],
  ['intro.enter','들어가기 단추 글','허브 들어가기'],
  ['intro.enter_hint','들어가기 단추 아래 작은 안내','Enter 키를 눌러도 들어가요'],
  ['intro.model_hint','3D 동물 아래 안내','동물을 눌러 보세요 · 끌어서 돌리기 · 빈 곳을 누르면 불꽃, 꾹 누르면 블랙홀'],
  ['intro.chip_game','미니게임 시작 단추','🎮 충치균 잡기'],
  ['intro.day1_chip','요일 단추 — 월요일','🐱 월'],
  ['intro.day2_chip','요일 단추 — 화요일','🐶 화'],
  ['intro.day3_chip','요일 단추 — 수요일','🐰 수'],
  ['intro.day4_chip','요일 단추 — 목요일','🐼 목'],
  ['intro.day5_chip','요일 단추 — 금요일','🦊 금'],
  ['intro.day6_chip','요일 단추 — 토요일','🐧 토'],
  ['intro.day0_chip','요일 단추 — 일요일','🐹 일'],
  ['intro.day1_name','월요일 동물 이름(큰 인사 위 작은 글)','🐱 월요일 친구 · 고양이 모모'],
  ['intro.day2_name','화요일 동물 이름(큰 인사 위 작은 글)','🐶 화요일 친구 · 웰시코기 콩이'],
  ['intro.day3_name','수요일 동물 이름(큰 인사 위 작은 글)','🐰 수요일 친구 · 토끼 토리'],
  ['intro.day4_name','목요일 동물 이름(큰 인사 위 작은 글)','🐼 목요일 친구 · 판다 바오'],
  ['intro.day5_name','금요일 동물 이름(큰 인사 위 작은 글)','🦊 금요일 친구 · 여우 루루'],
  ['intro.day6_name','토요일 동물 이름(큰 인사 위 작은 글)','🐧 토요일 친구 · 펭귄 펭순'],
  ['intro.day0_name','일요일 동물 이름(큰 인사 위 작은 글)','🐹 일요일 친구 · 햄스터 도토리'],
  ['intro.day1_say','월요일 동물을 누르면 나오는 말 — 한 줄에 하나, 누를 때마다 다음 줄',['월요일이에요, 천천히 시작해요 ☕','모모가 응원해요! 냐옹 💜','이번 주도 잘 부탁해요 🐾'].join('\n')],
  ['intro.day2_say','화요일 동물을 누르면 나오는 말 — 한 줄에 하나, 누를 때마다 다음 줄',['멍! 오늘도 신나게 가 봐요 🧡','콩이랑 같이 힘내요! 🐾','산책하듯 가볍게, 화이팅!'].join('\n')],
  ['intro.day3_say','수요일 동물을 누르면 나오는 말 — 한 줄에 하나, 누를 때마다 다음 줄',['벌써 한 주의 반이에요 🌷','토리가 깡총 응원해요 🐰','오늘 하루도 폴짝폴짝!'].join('\n')],
  ['intro.day4_say','목요일 동물을 누르면 나오는 말 — 한 줄에 하나, 누를 때마다 다음 줄',['조금만 더 힘내요 🎋','바오가 꼭 안아 줄게요 🐼','쉬엄쉬엄, 그래도 꾸준히!'].join('\n')],
  ['intro.day5_say','금요일 동물을 누르면 나오는 말 — 한 줄에 하나, 누를 때마다 다음 줄',['드디어 금요일! 🎉','루루가 반짝반짝 응원해요 ✨','이번 주도 정말 수고했어요 🦊'].join('\n')],
  ['intro.day6_say','토요일 동물을 누르면 나오는 말 — 한 줄에 하나, 누를 때마다 다음 줄',['주말 근무, 고마워요 💙','펭순이가 뒤뚱뒤뚱 응원해요 🐧','오늘은 시원하게 가 봐요!'].join('\n')],
  ['intro.day0_say','일요일 동물을 누르면 나오는 말 — 한 줄에 하나, 누를 때마다 다음 줄',['일요일에도 나와 줘서 고마워요 🧡','도토리가 해바라기씨 나눠 줄게요 🌻','푹 쉬는 것도 잊지 말아요 😴'].join('\n')],
  ['intro.card_me','카드 제목 — 내 현황','🙋 내 현황'],
  ['intro.stat_leave','내 현황 — 연차 칸 이름','연차 잔여'],
  ['intro.stat_notice','내 현황 — 공지 칸 이름','안 읽은 공지'],
  ['intro.stat_appr','내 현황 — 결재 칸 이름(실장·원장만 보임)','결재 대기'],
  ['intro.stat_docs','내 현황 — 서류 칸 이름','미제출 서류'],
  ['intro.card_soon','카드 제목 — 다가오는 일정','📅 다가오는 일정'],
  ['intro.soon_empty','다가오는 일정이 없을 때','2주 안에 등록된 일정이 없어요'],
  ['intro.card_quote','카드 제목 — 오늘의 한마디','💬 오늘의 한마디'],
  ['intro.card_fact','카드 제목 — 오늘의 치아 상식','🦷 오늘의 치아 상식'],
  ['intro.quotes','오늘의 한마디 목록 — 한 줄에 하나, 날마다 다음 줄이 보임',[
    '오늘의 작은 친절이 환자에겐 오래 남는 기억이 돼요.',
    '정성으로 꼼꼼히 — 우리가 매일 지키는 약속이에요.',
    '「고마워요」 한마디, 오늘도 먼저 건네 봐요.',
    '웃는 얼굴은 최고의 첫인상이에요.',
    '바쁠수록 천천히, 정확하게.',
    '우리 팀이 있어 오늘도 든든해요.',
    '정을 나누는 치과, 그 정은 우리에게서 시작돼요.',
    '실수는 배움이 되고, 배움은 실력이 돼요.',
    '환자의 「덕분에 편했어요」가 우리의 보람이에요.',
    '오늘도 안전하게, 건강하게, 즐겁게!'
  ].join('\n')],
  ['intro.facts','오늘의 치아 상식 목록 — 한 줄에 하나, 날마다 다음 줄이 보임',[
    '치아 법랑질은 우리 몸에서 가장 단단한 조직이에요.',
    '칫솔은 3개월쯤 쓰면 새것으로 바꾸는 게 좋아요.',
    '임플란트가 뼈와 단단히 붙는 것을 「골유착」이라고 해요.',
    '영구치는 사랑니까지 모두 32개예요.',
    '양치는 한 번에 2~3분, 치아 안쪽 면까지 꼼꼼히!',
    '치실은 칫솔이 닿지 않는 치아 사이를 닦아 줘요.',
    '산성 음료를 마신 직후엔 물로 먼저 헹궈 주세요.',
    '젖니는 보통 생후 6개월 무렵부터 나기 시작해요.',
    '침은 음식 찌꺼기를 씻어 내고 산을 중화해 줘요.',
    '스케일링은 보통 1년에 한 번 이상 권장돼요.'
  ].join('\n')],
  ['intro.particle_words','빛 알갱이가 모여 만드는 글자 — 한 줄에 하나(짧을수록 또렷함)','좋은 하루\n오늘도 화이팅\n고마워요\n함께라서 좋아'],
  ['intro.streak','오른쪽 위 연속 방문 표시 — {n}은 연속 일수','🔥 {n}일 연속 방문'],
  ['intro.game_hint','게임 시작할 때 안내','15초! 떠다니는 충치균을 눌러 잡아요'],
  ['intro.game_score','게임 중 점수 — {n}은 잡은 수, {s}는 남은 초','🦠 {n}마리 · {s}초'],
  ['intro.game_result','게임 끝 — {n}은 잡은 수, {best}는 오늘 이 기기 최고 기록','{n}마리 잡았어요! 오늘 최고 {best}마리'],
  ['intro.edit','원장 전용 — 문구 고치기 단추','✏️ 문구 고치기'],
  ['intro.loading','정보 불러오는 중 글','불러오는 중…']
];
const DEF_MAP={};DEFS.forEach(function(d){DEF_MAP[d[0]]=d[2];});
root.HUB_INTRO_TEXT_DEFS=DEFS; // hub-texts.js 「글 고치기」 목록이 읽음

function T(key,vars){
  const d=DEF_MAP[key]==null?'':DEF_MAP[key];
  const v=typeof root.hubText==='function'?root.hubText(key,d,vars):d;
  if(!vars)return String(v);
  return String(v).replace(/\{([a-z_]+)\}/g,function(m,k){return Object.prototype.hasOwnProperty.call(vars,k)?String(vars[k]):m;});
}
function lines(key){return T(key).split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dayIndex(){const d=new Date();return Math.floor((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()))/86400000);}
function lsGet(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
const clamp=function(v,a,b){return v<a?a:v>b?b:v;};
const ease={
  outCubic:function(t){return 1-Math.pow(1-t,3);},
  inOutCubic:function(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;},
  outBack:function(t){const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2);},
  outElastic:function(t){if(t===0||t===1)return t;return Math.pow(2,-10*t)*Math.sin((t*10-.75)*(2*Math.PI)/3)+1;},
  outBounce:function(x){const n1=7.5625,d1=2.75;if(x<1/d1)return n1*x*x;if(x<2/d1)return n1*(x-=1.5/d1)*x+.75;if(x<2.5/d1)return n1*(x-=2.25/d1)*x+.9375;return n1*(x-=2.625/d1)*x+.984375;}
};

/* ── 언제 띄우나 ── */
function seenKey(uid){return 'hubIntro.seen.'+(uid||'me');}
function shouldShow(opts){
  opts=opts||{};
  let q=null;try{q=new URLSearchParams(location.search);}catch(e){}
  if(q&&q.get('intro')==='1')return true;
  if(q&&(q.get('intro')==='0'||q.get('tab')))return false; // 알림을 눌러 특정 탭으로 바로 온 경우는 건너뜀
  const mode=String(T('intro.show_mode')).trim().toLowerCase();
  if(mode==='off')return false;
  if(mode==='always')return true;
  return lsGet(seenKey(opts.userId),'')!==ymd(new Date());
}

/* ── 화면 틀(CSS) ── */
const CSS=`
#hubIntro{position:fixed;inset:0;z-index:2147483000;overflow:hidden;color:#e6f2ef;font-family:'Segoe UI','Malgun Gothic',sans-serif;
  --day:#2fd9c4;--dayBg:rgba(47,217,196,.16);
  background:radial-gradient(120% 90% at 50% 38%,var(--dayBg) 0%,rgba(8,16,20,0) 60%),radial-gradient(120% 90% at 50% 38%,#121a24 0%,#0a0f15 55%,#05070a 100%);opacity:0;transition:opacity .5s ease;-webkit-tap-highlight-color:transparent}
#hubIntro.on{opacity:1}
#hubIntro.out{opacity:0;transition:opacity .45s ease}
#hubIntro canvas.hi-gl{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
#hubIntro canvas.hi-gl.drag{cursor:grabbing}
#hubIntro .hi-vign{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 45%,transparent 55%,rgba(0,0,0,.55) 100%)}
#hubIntro .hi-flash{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 45%,#fffaf2 0%,var(--day) 35%,transparent 70%);opacity:0;transition:opacity .35s}
#hubIntro .hi-ui{position:absolute;inset:0;display:flex;flex-direction:column;gap:10px;pointer-events:none;
  padding:max(14px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
#hubIntro .hi-ui>*{pointer-events:none}
#hubIntro .pe{pointer-events:auto}
#hubIntro .hi-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
#hubIntro .hi-brand img{height:30px;display:block;filter:drop-shadow(0 0 12px rgba(47,217,196,.35))}
#hubIntro .hi-brand .en{font-size:10px;letter-spacing:.28em;color:#8fd6cc;margin-top:6px;opacity:.85}
#hubIntro .hi-brand .slo{font-size:13px;color:#cfe9e4;margin-top:3px}
#hubIntro .hi-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px;text-align:right}
#hubIntro .hi-clock{font-size:30px;font-weight:300;letter-spacing:.04em;line-height:1;font-variant-numeric:tabular-nums;text-shadow:0 0 18px rgba(47,217,196,.45)}
#hubIntro .hi-date{font-size:12.5px;color:#9fc4bd}
#hubIntro .hi-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.14);background:rgba(10,30,27,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  border-radius:999px;padding:5px 11px;font-size:12px;color:#e6f2ef}
#hubIntro .hi-streak{border-color:rgba(227,179,65,.45);color:#ffe2a0;box-shadow:0 0 16px rgba(227,179,65,.18) inset}
#hubIntro button.hi-chip{cursor:pointer;font:inherit;font-size:12.5px;transition:transform .15s,background .2s,border-color .2s}
#hubIntro button.hi-chip:hover{transform:translateY(-1px);border-color:rgba(47,217,196,.6)}
#hubIntro button.hi-chip.act{background:rgba(47,217,196,.22);border-color:#2fd9c4;color:#fff}
#hubIntro .hi-stage{flex:1;min-height:150px;position:relative}
#hubIntro .hi-greet{text-align:center}
#hubIntro .hi-dayname{display:inline-block;font-size:12.5px;font-weight:600;color:#fff;padding:3px 12px;border-radius:999px;margin-bottom:4px;
  background:color-mix(in srgb,var(--day) 28%,rgba(10,14,20,.6));border:1px solid color-mix(in srgb,var(--day) 70%,transparent);transition:background .4s,border-color .4s}
#hubIntro button.hi-chip.day.act{background:color-mix(in srgb,var(--day) 32%,transparent);border-color:var(--day)}
#hubIntro .hi-say{position:absolute;left:0;top:0;pointer-events:none;max-width:min(260px,70vw);font-size:14px;font-weight:600;line-height:1.4;color:#2a2230;text-align:center;
  padding:9px 14px;border-radius:16px;background:#fffdf8;box-shadow:0 8px 26px rgba(0,0,0,.35),0 0 0 2px var(--day);opacity:0;transform-origin:50% 100%;transition:opacity .25s}
#hubIntro .hi-say::after{content:'';position:absolute;left:50%;bottom:-8px;margin-left:-8px;border:8px solid transparent;border-bottom:0;border-top-color:#fffdf8}
#hubIntro .hi-say.on{opacity:1}
#hubIntro .hi-greet h1{font-size:clamp(22px,3.4vw,38px);font-weight:700;letter-spacing:-.01em;line-height:1.25;
  background:linear-gradient(100deg,#ffffff 0%,#bff7ef 30%,#ffe7a6 50%,#bff7ef 70%,#ffffff 100%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;
  animation:hiShine 6s linear infinite;filter:drop-shadow(0 2px 14px rgba(0,0,0,.45))}
#hubIntro .hi-greet .sub{font-size:13px;color:#a9cfc8;margin-top:4px}
#hubIntro .hi-hint{font-size:11.5px;color:#7fa9a2;margin-top:4px}
@keyframes hiShine{0%{background-position:100% 0}100%{background-position:-150% 0}}
#hubIntro .hi-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:7px;margin-top:8px}
#hubIntro .hi-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;perspective:900px}
#hubIntro .hi-card{position:relative;border-radius:16px;padding:13px 15px;min-width:0;overflow:hidden;
  background:linear-gradient(160deg,rgba(28,58,53,.62),rgba(9,24,22,.62));border:1px solid rgba(255,255,255,.10);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 10px 30px rgba(0,0,0,.35);transform-style:preserve-3d;transition:transform .25s ease,border-color .25s;opacity:0;translate:0 18px}
#hubIntro.ready .hi-card{opacity:1;translate:0 0;transition:transform .25s ease,border-color .25s,opacity .6s ease,translate .7s cubic-bezier(.2,.9,.2,1)}
#hubIntro .hi-card:hover{border-color:rgba(47,217,196,.45)}
#hubIntro .hi-card::after{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(260px circle at var(--mx,50%) var(--my,0%),rgba(47,217,196,.16),transparent 60%)}
#hubIntro .hi-card h3{font-size:12.5px;font-weight:600;color:#9fe6dc;margin:0 0 8px;letter-spacing:.02em}
#hubIntro .hi-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 10px}
#hubIntro .hi-stat .n{font-size:22px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
#hubIntro .hi-stat .n small{font-size:11px;font-weight:400;color:#9fc4bd;margin-left:2px}
#hubIntro .hi-stat .l{font-size:11px;color:#9fc4bd}
#hubIntro .hi-stat .n.warn{color:#ffd36b}
#hubIntro .hi-soon{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px;font-size:12.5px}
#hubIntro .hi-soon li{display:flex;gap:8px;align-items:baseline;min-width:0}
#hubIntro .hi-soon .d{flex:none;font-size:11px;color:#2fd9c4;min-width:52px;font-variant-numeric:tabular-nums}
#hubIntro .hi-soon .d.hol{color:#ff9a95}
#hubIntro .hi-soon .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#hubIntro .hi-quote{font-size:14px;line-height:1.55;color:#f2fbf9}
#hubIntro .hi-muted{font-size:12px;color:#86aaa3}
#hubIntro .hi-bottom{display:flex;flex-direction:column;align-items:center;gap:5px;margin-top:2px}
#hubIntro .hi-enter{pointer-events:auto;position:relative;border:0;border-radius:999px;padding:14px 34px;font:inherit;font-size:16px;font-weight:700;color:#04201c;cursor:pointer;
  background:linear-gradient(100deg,#2fd9c4,#9ff5e9 45%,#ffe08a 55%,#2fd9c4);background-size:220% 100%;animation:hiShine 4s linear infinite;
  box-shadow:0 0 0 1px rgba(255,255,255,.35) inset,0 10px 34px rgba(47,217,196,.45);transition:transform .15s}
#hubIntro .hi-enter:hover{transform:translateY(-2px) scale(1.02)}
#hubIntro .hi-enter:active{transform:scale(.97)}
#hubIntro .hi-enter .arr{display:inline-block;margin-left:8px;transition:transform .2s}
#hubIntro .hi-enter:hover .arr{transform:translateX(4px)}
#hubIntro .hi-enter-hint{font-size:11px;color:#6f968f}
#hubIntro .hi-hud{position:absolute;left:50%;top:max(74px,calc(env(safe-area-inset-top) + 64px));transform:translateX(-50%);pointer-events:none;font-size:18px;font-weight:700;
  padding:8px 18px;border-radius:999px;background:rgba(40,10,40,.55);border:1px solid rgba(255,140,220,.5);color:#ffe3f6;opacity:0;transition:opacity .3s;white-space:nowrap}
#hubIntro .hi-toast{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%) scale(.9);pointer-events:none;font-size:20px;font-weight:800;text-align:center;
  padding:14px 22px;border-radius:18px;background:rgba(5,25,22,.82);border:1px solid rgba(255,224,138,.6);color:#fff3cc;opacity:0;transition:opacity .3s,transform .3s;max-width:88vw}
#hubIntro .hi-toast.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
#hubIntro [data-ik]{transition:outline-color .2s}
#hubIntro.editing [data-ik]{outline:1.5px dashed rgba(255,211,107,.9);outline-offset:3px;cursor:pointer;pointer-events:auto}
#hubIntro .hi-edit{position:absolute;top:0;right:0;bottom:0;width:min(440px,100vw);background:rgba(7,20,18,.97);border-left:1px solid rgba(255,255,255,.12);
  transform:translateX(102%);transition:transform .3s ease;pointer-events:auto;display:flex;flex-direction:column;z-index:5}
#hubIntro .hi-edit.on{transform:none}
#hubIntro .hi-edit header{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.1)}
#hubIntro .hi-edit header b{font-size:15px}
#hubIntro .hi-edit .body{overflow:auto;padding:10px 16px 30px;display:flex;flex-direction:column;gap:12px}
#hubIntro .hi-edit .it{border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px;background:rgba(255,255,255,.02)}
#hubIntro .hi-edit .it.focus{border-color:#ffd36b;box-shadow:0 0 0 2px rgba(255,211,107,.25)}
#hubIntro .hi-edit .w{font-size:11.5px;color:#9fc4bd;margin-bottom:6px}
#hubIntro .hi-edit textarea{width:100%;min-height:40px;resize:vertical;font:inherit;font-size:13px;color:#e6f2ef;background:#0d1715;border:1px solid #24332f;border-radius:8px;padding:7px 9px;box-sizing:border-box}
#hubIntro .hi-edit .row{display:flex;gap:6px;margin-top:6px;align-items:center}
#hubIntro .hi-edit .row button{font:inherit;font-size:12px;border-radius:8px;padding:5px 10px;border:1px solid #2b4440;background:#14201d;color:#e6f2ef;cursor:pointer}
#hubIntro .hi-edit .row button.sv{background:#156f72;border-color:#2fd9c4}
#hubIntro .hi-edit .row .msg{font-size:11.5px;color:#8fd6cc}
#hubIntro .hi-edit .row .msg.err{color:#ff7b76}
#hubIntro .hi-edit .search{width:100%;font:inherit;font-size:13px;color:#e6f2ef;background:#0d1715;border:1px solid #24332f;border-radius:8px;padding:8px 10px;box-sizing:border-box}
#hubIntro .hi-edit .hb{font-size:12px;color:#9fc4bd;line-height:1.5}
@media (max-width:820px){
  #hubIntro .hi-cards{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:10px;margin:0 -16px;padding:2px 16px 4px;scrollbar-width:none;touch-action:pan-x}
  #hubIntro .hi-cards::-webkit-scrollbar{display:none}
  #hubIntro .hi-card{flex:0 0 78%;scroll-snap-align:center}
  #hubIntro .hi-clock{font-size:24px}
  #hubIntro .hi-brand img{height:22px}
  #hubIntro .hi-brand .en{display:none}
  #hubIntro .hi-brand .slo{font-size:11.5px}
  #hubIntro .hi-enter{padding:13px 30px;font-size:15px}
  #hubIntro .hi-greet .sub{font-size:12px}
  #hubIntro .hi-hint{font-size:10.5px}
  #hubIntro button.hi-chip.day{padding:4px 8px;font-size:11.5px}
  #hubIntro .hi-chips{gap:5px}
}
@media (pointer:coarse){#hubIntro .hi-enter-hint{display:none}}
@media (max-height:640px){#hubIntro .hi-hint,#hubIntro .hi-enter-hint{display:none}}
@media (prefers-reduced-motion:reduce){#hubIntro .hi-greet h1,#hubIntro .hi-enter{animation:none}}
`;
function injectCss(){
  if(document.getElementById('hubIntroCss'))return;
  const s=document.createElement('style');s.id='hubIntroCss';s.textContent=CSS;document.head.appendChild(s);
}

/* ── 기기 등급 ── */
function deviceTier(){
  const coarse=root.matchMedia&&matchMedia('(pointer:coarse)').matches;
  const small=Math.min(innerWidth,innerHeight)<700;
  const cores=navigator.hardwareConcurrency||4;
  const mem=navigator.deviceMemory||4;
  let force='';try{force=new URLSearchParams(location.search).get('introTier')||'';}catch(e){}
  const low=force?force==='low':(coarse||small||cores<=4||mem<=4);
  let motion='';try{motion=new URLSearchParams(location.search).get('introMotion')||'';}catch(e){}
  const reduced=motion?motion==='reduce':(root.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  return {low:low,reduced:!!reduced,
    particles:low?4200:11000,sparks:low?700:1600,
    pr:Math.min(root.devicePixelRatio||1,low?1.5:2)};
}

/* ════════════════ 첫 화면 한 번 ════════════════ */
let CURRENT=null;

function show(opts){
  if(CURRENT)return CURRENT;
  opts=opts||{};
  injectCss();
  const S={opts:opts,disposers:[],timers:[],destroyed:false,editing:false,day:todayN()};
  CURRENT=S;
  const el=document.createElement('div');el.id='hubIntro';el.setAttribute('role','dialog');el.setAttribute('aria-label','직원허브 첫 화면');
  S.el=el;
  el.innerHTML=uiHtml(opts);
  setDayColor(S,S.day);
  document.body.appendChild(el);
  S.prevOverflow=document.documentElement.style.overflow;
  document.documentElement.style.overflow='hidden';
  requestAnimationFrame(function(){el.classList.add('on');});
  applyTexts(S);
  startClock(S);
  bindUi(S);
  updateStreak(S);
  loadInfo(S);
  S.enterBtn=el.querySelector('.hi-enter');
  setTimeout(function(){try{S.enterBtn.focus({preventScroll:true});}catch(e){}},400);
  bootGraphics(S);
  return S;
}

function uiHtml(opts){
  return `
<canvas class="hi-gl" aria-hidden="true"></canvas>
<div class="hi-vign"></div>
<div class="hi-flash"></div>
<div class="hi-ui">
  <div class="hi-top">
    <div class="hi-brand pe">
      <img src="${LOGO_URL}" alt="아산정플란트치과" onerror="this.style.display='none'">
      <div class="en" data-ik="intro.brand"></div>
      <div class="slo" data-ik="intro.slogan"></div>
    </div>
    <div class="hi-right">
      <div class="hi-clock" aria-live="off">--:--</div>
      <div class="hi-date"></div>
      <span class="hi-chip hi-streak pe" data-ik="intro.streak"></span>
      ${opts.isOwner?'<button type="button" class="hi-chip pe hi-editbtn" data-ik-btn="intro.edit"></button>':''}
    </div>
  </div>
  <div class="hi-stage"></div>
  <div class="hi-greet">
    <div class="hi-dayname pe" data-ik="dayname"></div>
    <h1 class="pe" data-ik="greet"></h1>
    <div class="sub pe" data-ik="intro.sub"></div>
    <div class="hi-hint pe" data-ik="intro.model_hint"></div>
    <div class="hi-chips">
      ${DAY_ORDER.map(function(n){return '<button type="button" class="hi-chip pe day" data-day="'+n+'" data-ik="intro.day'+n+'_chip"></button>';}).join('')}
      <button type="button" class="hi-chip pe" data-game data-ik="intro.chip_game"></button>
    </div>
  </div>
  <div class="hi-cards pe">
    <div class="hi-card"><h3 data-ik="intro.card_me"></h3><div class="hi-stats" data-slot="stats"><div class="hi-muted" data-ik="intro.loading"></div></div></div>
    <div class="hi-card"><h3 data-ik="intro.card_soon"></h3><div data-slot="soon"><div class="hi-muted" data-ik="intro.loading"></div></div></div>
    <div class="hi-card"><h3 data-ik="intro.card_quote"></h3><div class="hi-quote" data-slot="quote"></div></div>
    <div class="hi-card"><h3 data-ik="intro.card_fact"></h3><div class="hi-quote" data-slot="fact"></div></div>
  </div>
  <div class="hi-bottom">
    <button type="button" class="hi-enter"><span data-ik="intro.enter"></span><span class="arr">→</span></button>
    <div class="hi-enter-hint pe" data-ik="intro.enter_hint"></div>
  </div>
</div>
<div class="hi-say"></div>
<div class="hi-hud"></div>
<div class="hi-toast"></div>
${opts.isOwner?'<aside class="hi-edit" aria-label="첫 화면 문구 고치기"></aside>':''}`;
}

function greetKey(){
  const h=new Date().getHours();
  if(h>=5&&h<11)return 'intro.greet_morning';
  if(h>=11&&h<17)return 'intro.greet_noon';
  if(h>=17&&h<22)return 'intro.greet_evening';
  return 'intro.greet_night';
}
function pickDaily(key,salt){const L=lines(key);if(!L.length)return '';return L[(dayIndex()+(salt||0))%L.length];}

function applyTexts(S){
  const el=S.el,vars={name:S.opts.name||'선생'};
  el.querySelectorAll('[data-ik]').forEach(function(n){
    const k=n.getAttribute('data-ik');
    if(k==='greet'){n.textContent=T(greetKey(),vars);n.setAttribute('data-ikey',greetKey());return;}
    if(k==='dayname'){const dk='intro.day'+S.day+'_name';n.textContent=T(dk,vars);n.setAttribute('data-ikey',dk);return;}
    if(k==='intro.streak'){n.textContent=T(k,{n:S.streak||1});return;}
    n.textContent=T(k,vars);
  });
  el.querySelectorAll('[data-ik-btn]').forEach(function(n){n.textContent=T(n.getAttribute('data-ik-btn'));});
  const q=el.querySelector('[data-slot="quote"]');if(q){q.textContent=pickDaily('intro.quotes',0);q.setAttribute('data-ik-list','intro.quotes');}
  const f=el.querySelector('[data-slot="fact"]');if(f){f.textContent=pickDaily('intro.facts',3);f.setAttribute('data-ik-list','intro.facts');}
  el.querySelectorAll('[data-day]').forEach(function(b){b.classList.toggle('act',Number(b.getAttribute('data-day'))===S.day);});
  if(S.info)renderInfo(S);
  if(S.g&&S.g.setWords)S.g.setWords(lines('intro.particle_words'));
}

/* 요일 색을 화면에(배경 은은한 색·이름표·번쩍임) */
function setDayColor(S,n){
  const c=DAY_COLORS[n]||DAY_COLORS[0],r=hexRgb(c);
  S.el.style.setProperty('--day',c);
  S.el.style.setProperty('--dayBg','rgba('+Math.round(r[0]*255)+','+Math.round(r[1]*255)+','+Math.round(r[2]*255)+',.20)');
}
/* 다른 요일 동물 보기(단추) */
function selectDay(S,n){
  if(n===S.day||!S.g||!S.g.setDay)return;
  S.day=n;setDayColor(S,n);applyTexts(S);
  S.g.setDay(n);
}

function startClock(S){
  const days=['일','월','화','수','목','금','토'];
  const tick=function(){
    const d=new Date();
    const c=S.el.querySelector('.hi-clock'),dt=S.el.querySelector('.hi-date');
    if(c)c.textContent=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    if(dt)dt.textContent=d.getFullYear()+'년 '+(d.getMonth()+1)+'월 '+d.getDate()+'일 ('+days[d.getDay()]+')';
  };
  tick();S.timers.push(setInterval(tick,1000));
}

function updateStreak(S){
  const k='hubIntro.streak.'+(S.opts.userId||'me');
  const st=lsGet(k,{last:'',n:0}),today=ymd(new Date());
  const y=new Date();y.setDate(y.getDate()-1);
  let n=st.n||0;
  if(st.last===today)n=Math.max(1,n);else if(st.last===ymd(y))n=n+1;else n=1;
  lsSet(k,{last:today,n:n});
  S.streak=n;
  const c=S.el.querySelector('[data-ik="intro.streak"]');if(c)c.textContent=T('intro.streak',{n:n});
}

/* ── 실제 정보(호스트가 준 info 함수) ── */
function loadInfo(S){
  const f=S.opts.info;
  if(typeof f!=='function'){S.info={};renderInfo(S);return;}
  Promise.resolve().then(f).then(function(info){S.info=info||{};}).catch(function(){S.info={error:true};}).then(function(){if(!S.destroyed)renderInfo(S);});
}
function renderInfo(S){
  const info=S.info||{},el=S.el;
  const st=el.querySelector('[data-slot="stats"]');
  if(st){
    const cells=[];
    const cell=function(lk,v,unit,warn){cells.push('<div class="hi-stat"><div class="n'+(warn?' warn':'')+'"><span class="v" data-count="'+(v==null?'':v)+'">'+(v==null?'—':'0')+'</span>'+(unit&&v!=null?'<small>'+esc(unit)+'</small>':'')+'</div><div class="l" data-ik="'+lk+'">'+esc(T(lk))+'</div></div>');};
    cell('intro.stat_leave',info.leave,'일',false);
    cell('intro.stat_notice',info.notice,'건',info.notice>0);
    if(info.appr!=null)cell('intro.stat_appr',info.appr,'건',info.appr>0);
    cell('intro.stat_docs',info.docs,'개',info.docs>0);
    st.innerHTML=cells.join('');
    st.querySelectorAll('.v[data-count]').forEach(function(n){
      const raw=n.getAttribute('data-count'),target=Number(raw);if(raw===''||!isFinite(target))return;
      const t0=performance.now(),dur=1100;
      const stepN=function(now){const e=ease.outCubic(clamp((now-t0)/dur,0,1));n.textContent=String(target%1?(target*e).toFixed(1):Math.round(target*e));if(e<1&&!S.destroyed)requestAnimationFrame(stepN);};
      requestAnimationFrame(stepN);
    });
  }
  const so=el.querySelector('[data-slot="soon"]');
  if(so){
    const items=(info.soon||[]).slice(0,4);
    if(!items.length)so.innerHTML='<div class="hi-muted" data-ik="intro.soon_empty">'+esc(T('intro.soon_empty'))+'</div>';
    else so.innerHTML='<ul class="hi-soon">'+items.map(function(it){return '<li><span class="d'+(it.holiday?' hol':'')+'">'+esc(soonLabel(it.date))+'</span><span class="t">'+esc(it.title)+'</span></li>';}).join('')+'</ul>';
  }
  setTimeout(function(){if(!S.destroyed)el.classList.add('ready');},60);
}
function soonLabel(ds){
  const p=String(ds||'').split('-').map(Number);if(p.length<3)return ds;
  const d=new Date(p[0],p[1]-1,p[2]),t=new Date();t.setHours(0,0,0,0);
  const diff=Math.round((d-t)/86400000),days=['일','월','화','수','목','금','토'];
  if(diff===0)return '오늘';if(diff===1)return '내일';
  return (d.getMonth()+1)+'.'+d.getDate()+' ('+days[d.getDay()]+')';
}

/* ── 단추·키·카드 ── */
function bindUi(S){
  const el=S.el;
  const on=function(t,ev,fn,o){t.addEventListener(ev,fn,o);S.disposers.push(function(){t.removeEventListener(ev,fn,o);});};
  on(el.querySelector('.hi-enter'),'click',function(){enter(S);});
  on(document,'keydown',function(e){
    if(S.destroyed)return;
    const tag=(e.target&&e.target.tagName)||'';
    if(tag==='TEXTAREA'||tag==='INPUT')return;
    if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();enter(S);}
  });
  el.querySelectorAll('[data-day]').forEach(function(b){on(b,'click',function(){selectDay(S,Number(b.getAttribute('data-day')));});});
  const gb=el.querySelector('[data-game]');if(gb)on(gb,'click',function(){if(S.g)S.g.startGame();});
  // 카드 3D 기울기(마우스를 따라)
  el.querySelectorAll('.hi-card').forEach(function(c){
    on(c,'pointermove',function(e){
      if(e.pointerType==='touch')return;
      const r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
      c.style.transform='rotateX('+((.5-y)*9).toFixed(2)+'deg) rotateY('+((x-.5)*11).toFixed(2)+'deg) translateZ(6px)';
      c.style.setProperty('--mx',(x*100).toFixed(1)+'%');c.style.setProperty('--my',(y*100).toFixed(1)+'%');
    });
    on(c,'pointerleave',function(){c.style.transform='';});
  });
  if(S.opts.isOwner){
    const eb=el.querySelector('.hi-editbtn');
    if(eb)on(eb,'click',function(){toggleEdit(S);});
    on(el,'click',function(e){
      if(!S.editing)return;
      const n=e.target.closest&&e.target.closest('[data-ik],[data-ik-list]');
      if(!n||n.closest('.hi-edit'))return;
      e.preventDefault();e.stopPropagation();
      const ik=n.getAttribute('data-ik');
      const k=n.getAttribute('data-ik-list')||((ik==='greet'||ik==='dayname')?n.getAttribute('data-ikey'):ik);
      focusEditItem(S,k);
    },true);
  }
  on(document,'visibilitychange',function(){if(S.g)S.g.setPaused(document.hidden);});
}

/* ── 원장 전용: 문구 고치기 ── */
function toggleEdit(S){
  S.editing=!S.editing;
  S.el.classList.toggle('editing',S.editing);
  const panel=S.el.querySelector('.hi-edit');if(!panel)return;
  if(S.editing){drawEditPanel(S);panel.classList.add('on');}else panel.classList.remove('on');
}
function drawEditPanel(S,filter){
  const panel=S.el.querySelector('.hi-edit');
  const q=String(filter||'').trim();
  panel.innerHTML='<header><b>✏️ 첫 화면 문구 고치기</b><button type="button" class="hi-chip" data-x>닫기</button></header>'+
    '<div class="body"><div class="hb">점선 칸을 누르면 그 글로 바로 갑니다. 저장하면 모든 직원 화면에 바로 적용돼요. 비우고 저장하거나 「기본으로」를 누르면 처음 글로 돌아가요.</div>'+
    '<input class="search" type="search" placeholder="찾기 — 예: 인사, 상식, 게임" value="'+esc(q)+'">'+
    DEFS.map(function(d,i){
      if(q&&(d[0]+' '+d[1]+' '+T(d[0])).toLowerCase().indexOf(q.toLowerCase())<0)return '';
      const multi=/\n/.test(String(d[2]))||/목록/.test(d[1]);
      return '<div class="it" data-key="'+esc(d[0])+'"><div class="w">'+esc(d[1])+'</div><textarea rows="'+(multi?6:2)+'" data-i="'+i+'">'+esc(T(d[0]))+'</textarea>'+
        '<div class="row"><button type="button" class="sv" data-save="'+i+'">저장</button><button type="button" data-reset="'+i+'">기본으로</button><span class="msg"></span></div></div>';
    }).join('')+'</div>';
  panel.querySelector('[data-x]').onclick=function(){toggleEdit(S);};
  const sr=panel.querySelector('.search');
  sr.oninput=function(){const pos=sr.selectionStart;drawEditPanel(S,sr.value);const n=S.el.querySelector('.hi-edit .search');n.focus();try{n.setSelectionRange(pos,pos);}catch(e){}};
  panel.querySelectorAll('[data-save]').forEach(function(b){b.onclick=function(){saveItem(S,Number(b.getAttribute('data-save')),false);};});
  panel.querySelectorAll('[data-reset]').forEach(function(b){b.onclick=function(){saveItem(S,Number(b.getAttribute('data-reset')),true);};});
}
function focusEditItem(S,key){
  const panel=S.el.querySelector('.hi-edit');if(!panel)return;
  if(!panel.classList.contains('on')){drawEditPanel(S);panel.classList.add('on');}
  let it=panel.querySelector('.it[data-key="'+(window.CSS&&CSS.escape?CSS.escape(key):key)+'"]');
  if(!it){drawEditPanel(S);it=panel.querySelector('.it[data-key="'+key+'"]');}
  if(!it)return;
  panel.querySelectorAll('.it.focus').forEach(function(n){n.classList.remove('focus');});
  it.classList.add('focus');it.scrollIntoView({block:'center',behavior:'smooth'});
  const ta=it.querySelector('textarea');setTimeout(function(){try{ta.focus({preventScroll:true});}catch(e){}},250);
}
async function saveItem(S,i,reset){
  const d=DEFS[i],it=S.el.querySelector('.hi-edit .it[data-key="'+d[0]+'"]');if(!it)return;
  const msg=it.querySelector('.msg'),ta=it.querySelector('textarea');
  msg.className='msg';msg.textContent='저장 중…';
  let r;
  try{
    if(reset)r=await (S.opts.resetText?S.opts.resetText(d[0]):Promise.resolve({ok:false}));
    else r=await (S.opts.saveText?S.opts.saveText(d[0],ta.value):Promise.resolve({ok:false}));
  }catch(e){r={ok:false,error:e};}
  if(!r||!r.ok){msg.className='msg err';msg.textContent='저장하지 못했어요'+(r&&r.error&&r.error.message?' — '+r.error.message:'');return;}
  if(reset||r.action==='reset')ta.value=T(d[0]);
  msg.textContent=(reset||r.action==='reset')?'기본 글로 돌렸어요.':'저장했어요. 모든 직원에게 적용돼요.';
  applyTexts(S);
}

/* ── 들어가기 ── */
function enter(S){
  if(S.leaving||S.destroyed)return;
  S.leaving=true;
  lsSet(seenKey(S.opts.userId),ymd(new Date()));
  const finish=function(){
    S.el.classList.add('out');
    setTimeout(function(){destroy(S);},480);
  };
  if(S.g&&!S.g.reduced){S.g.warp(finish);}else finish();
}
function destroy(S){
  if(S.destroyed)return;S.destroyed=true;
  S.timers.forEach(function(t){clearInterval(t);clearTimeout(t);});
  S.disposers.forEach(function(f){try{f();}catch(e){}});
  if(S.g)try{S.g.dispose();}catch(e){}
  if(S.el&&S.el.parentNode)S.el.parentNode.removeChild(S.el);
  document.documentElement.style.overflow=S.prevOverflow||'';
  if(CURRENT===S)CURRENT=null;
  if(typeof S.opts.onClose==='function')try{S.opts.onClose();}catch(e){}
}

/* ════════════════ 그래픽 ════════════════ */
function bootGraphics(S){
  const tier=deviceTier();
  const canvas=S.el.querySelector('canvas.hi-gl');
  let gl=null;
  try{const tc=document.createElement('canvas');gl=tc.getContext('webgl2')||tc.getContext('webgl');}catch(e){}
  if(!gl){S.g=makeFallback(S,tier,false);return;}
  // 이미 얻은 문맥은 three가 그대로 씀. 6초 안에 못 불러오면 2D로.
  let settled=false;
  const to=setTimeout(function(){if(settled)return;settled=true;S.g=makeFallback(S,tier,true);},6000);
  S.timers.push(to);
  Promise.all([import(THREE_URL),import(GLTF_URL),loadImage(dayPng(S.day))]).then(function(res){
    if(settled||S.destroyed)return;settled=true;clearTimeout(to);
    try{S.g=makeScene(S,res[0],res[1].GLTFLoader,res[2],tier,canvas);}
    catch(e){console.warn('[hub-intro] 3D 실패 → 2D',e);S.g=makeFallback(S,tier,true);}
  }).catch(function(e){
    if(settled||S.destroyed)return;settled=true;clearTimeout(to);
    console.warn('[hub-intro] three 불러오기 실패 → 2D',e);S.g=makeFallback(S,tier,true);
  });
}
function loadImage(src){return new Promise(function(ok,no){const im=new Image();im.onload=function(){ok(im);};im.onerror=function(){ok(null);};im.src=src;});}

/* 캔버스 글자 → 점 */
function samplePoints(drawFn,cw,ch,step){
  const c=document.createElement('canvas');c.width=cw;c.height=ch;const x=c.getContext('2d');
  drawFn(x,cw,ch);
  const d=x.getImageData(0,0,cw,ch).data,pts=[];
  for(let y=0;y<ch;y+=step)for(let xx=0;xx<cw;xx+=step){const i=(y*cw+xx)*4;if(d[i+3]>130)pts.push([xx/cw,y/ch,d[i],d[i+1],d[i+2]]);}
  return pts;
}

function makeScene(S,THREE,GLTFLoader,dayImg,tier,canvas){
  const el=S.el;
  const renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(tier.pr);
  renderer.setClearColor(0x000000,0);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(42,1,0.1,200);
  camera.position.set(0,0,11);
  const baseFov=42;

  /* 반사용 환경(외부 파일 없이 빛 상자로) */
  const pm=new THREE.PMREMGenerator(renderer);
  const envScene=new THREE.Scene();
  const roomMat=new THREE.MeshBasicMaterial({color:0x0a1d1a,side:THREE.BackSide});
  envScene.add(new THREE.Mesh(new THREE.BoxGeometry(30,30,30),roomMat));
  const lb=function(col,inten,pos,sc){const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:new THREE.Color(col).multiplyScalar(inten)}));m.position.set(pos[0],pos[1],pos[2]);m.scale.set(sc[0],sc[1],sc[2]);envScene.add(m);};
  lb(0xffffff,9,[0,12,4],[14,.4,6]);
  lb(0x2fd9c4,6,[-12,2,2],[.4,10,8]);
  lb(0xffd27a,5,[12,-2,4],[.4,8,6]);
  lb(0x9fd0ff,3,[0,-6,12],[10,4,.4]);
  const envRT=pm.fromScene(envScene,0.035);
  scene.environment=envRT.texture;
  envScene.traverse(function(o){if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
  pm.dispose();

  scene.add(new THREE.HemisphereLight(0xbff7ef,0x0b1f1c,.55));
  const key=new THREE.DirectionalLight(0xffffff,2.0);key.position.set(4,6,8);scene.add(key);
  const rim=new THREE.PointLight(0x2fd9c4,30,30,1.6);rim.position.set(-5,2,-2);scene.add(rim);
  const gold=new THREE.PointLight(0xffc86b,22,25,1.6);gold.position.set(4,-2,4);scene.add(gold);

  /* 반짝이 둥근 점 무늬 */
  const dotTex=(function(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.8)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);const t=new THREE.CanvasTexture(c);return t;})();

  /* ── 영웅(가운데 3D) — 요일 동물 ── */
  const hero=new THREE.Group();scene.add(hero);
  const heroSpin=new THREE.Group();hero.add(heroSpin);
  const glowMat=new THREE.SpriteMaterial({map:dotTex,color:new THREE.Color(DAY_COLORS[S.day]),transparent:true,opacity:.28,depthWrite:false,blending:THREE.AdditiveBlending});
  const aura=new THREE.Sprite(glowMat);aura.scale.set(7.5,7.5,1);aura.position.z=-1.2;hero.add(aura);
  const holder=new THREE.Group();heroSpin.add(holder);holder.visible=false;
  const ANIMAL_H=3.9,ANIMAL_W=4.6;
  let animalTop=ANIMAL_H/2; // 말풍선·하트가 나오는 머리 위 높이(정규화 단위)
  // 가져온 모델을 그림과 같은 각도로 돌리고, 높이 3.3에 맞춰 가운데에 놓음
  function fitAnimal(obj){
    const inner=new THREE.Group();inner.add(obj);inner.rotation.y=ANIMAL_YAW;
    const wrap=new THREE.Group();wrap.add(inner);
    const b=new THREE.Box3().setFromObject(wrap),sz=b.getSize(new THREE.Vector3()),ct=b.getCenter(new THREE.Vector3());
    const k=Math.min(ANIMAL_H/(sz.y||1),ANIMAL_W/(sz.x||1));
    inner.position.set(-ct.x*k,-ct.y*k,-ct.z*k);inner.scale.setScalar(k);
    wrap.userData.top=sz.y*k/2;
    wrap.traverse(function(o){if(o.isMesh){o.userData.hit=true;
      (Array.isArray(o.material)?o.material:[o.material]).forEach(function(m){if('roughness' in m){m.roughness=Math.max(m.roughness,.78);m.metalness=0;m.envMapIntensity=.55;}});}});
    return wrap;
  }
  function planeAnimal(tex,img){ // 3D를 못 불러올 때: 그림 판
    const ar=img&&img.width?img.width/img.height:1;
    tex.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(ANIMAL_H*ar,ANIMAL_H),new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
    m.userData.hit=true;const g=new THREE.Group();g.add(m);g.userData.top=ANIMAL_H/2;g.userData.flat=true;return g;
  }
  const glbCache={},pngCache={};pngCache[S.day]=Promise.resolve(dayImg);
  const gltfLoader=new GLTFLoader();
  function getPng(n){if(!pngCache[n])pngCache[n]=loadImage(dayPng(n));return pngCache[n];}
  function getAnimal(n){
    if(!glbCache[n])glbCache[n]=gltfLoader.loadAsync(dayGlb(n)).then(function(g){return fitAnimal(g.scene);}).catch(function(e){
      console.warn('[hub-intro] 동물 3D 못 불러옴 → 그림 판',n,e);
      return getPng(n).then(function(img){return img?planeAnimal(new THREE.Texture(img),img):null;}).then(function(g){if(g&&g.children[0].material.map)g.children[0].material.map.needsUpdate=true;return g;});
    });
    return glbCache[n];
  }
  let cur=null,curDay=S.day,curReady=false;
  getAnimal(S.day).then(function(a){if(disposed||curDay!==S.day)return;cur=a;curReady=true;});
  function putAnimal(a){
    while(holder.children.length)holder.remove(holder.children[0]);
    if(a){holder.add(a);animalTop=a.userData.top||ANIMAL_H/2;}
  }

  /* ── 빛 알갱이(파티클) ── */
  const N=tier.particles;
  const P={
    pos:new Float32Array(N*3),vel:new Float32Array(N*3),tgt:new Float32Array(N*3),
    colA:new Float32Array(N*3),colB:new Float32Array(N*3),w:new Float32Array(N),des:new Float32Array(N),
    seed:new Float32Array(N),size:new Float32Array(N),
    r:new Float32Array(N),th:new Float32Array(N),h:new Float32Array(N),spd:new Float32Array(N),kind:new Uint8Array(N),
    order:new Uint32Array(N),active:N
  };
  const palette=[[.18,.85,.77],[.08,.44,.45],[.89,.70,.25],[.85,.98,.96],[.44,.70,1]];
  const gauss=function(){return (Math.random()+Math.random()+Math.random()-1.5)*1.15;};
  for(let i=0;i<N;i++){
    P.seed[i]=Math.random();
    const fg=Math.random()<.14;P.kind[i]=fg?1:0;
    if(fg){P.r[i]=(Math.random()-.5)*22;P.h[i]=(Math.random()-.5)*14;P.th[i]=-3+Math.random()*9;P.spd[i]=.12+Math.random()*.25;P.size[i]=1.5+Math.random()*2.4;}
    else{const arm=i%3,rr=1.6+Math.pow(Math.random(),1.5)*13;P.r[i]=rr;P.th[i]=arm*Math.PI*2/3+rr*.42+gauss()*.32;P.h[i]=gauss()*.45*(1-rr/18);P.spd[i]=.035+.22/rr;P.size[i]=.7+Math.random()*1.5*(1-rr/18)+(Math.random()<.04?2.2:0);}
    const c=palette[Math.random()<.5?0:Math.random()<.5?3:Math.random()<.6?2:Math.random()<.5?1:4];
    const j=.85+Math.random()*.3;P.colA[i*3]=c[0]*j;P.colA[i*3+1]=c[1]*j;P.colA[i*3+2]=c[2]*j;
    P.colB[i*3]=c[0];P.colB[i*3+1]=c[1];P.colB[i*3+2]=c[2];
    // 시작: 멀리 흩어진 구에서 날아 들어옴
    const u=Math.random()*2-1,a=Math.random()*Math.PI*2,R=26+Math.random()*16,s=Math.sqrt(1-u*u);
    P.pos[i*3]=Math.cos(a)*s*R;P.pos[i*3+1]=u*R*.6;P.pos[i*3+2]=Math.sin(a)*s*R-10;
    P.order[i]=i;
  }
  for(let i=N-1;i>0;i--){const j=(Math.random()*(i+1))|0;const t=P.order[i];P.order[i]=P.order[j];P.order[j]=t;}
  const pGeo=new THREE.BufferGeometry();
  const posAttr=new THREE.BufferAttribute(P.pos,3);posAttr.setUsage(THREE.DynamicDrawUsage);
  const wAttr=new THREE.BufferAttribute(P.w,1);wAttr.setUsage(THREE.DynamicDrawUsage);
  const colBAttr=new THREE.BufferAttribute(P.colB,3);colBAttr.setUsage(THREE.DynamicDrawUsage);
  pGeo.setAttribute('position',posAttr);pGeo.setAttribute('aColA',new THREE.BufferAttribute(P.colA,3));pGeo.setAttribute('aColB',colBAttr);
  pGeo.setAttribute('aW',wAttr);pGeo.setAttribute('aSeed',new THREE.BufferAttribute(P.seed,1));pGeo.setAttribute('aSize',new THREE.BufferAttribute(P.size,1));
  const pMat=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uPR:{value:renderer.getPixelRatio()},uScale:{value:1},uWarp:{value:0},uWS:{value:1.5}},
    vertexShader:`attribute vec3 aColA;attribute vec3 aColB;attribute float aW;attribute float aSeed;attribute float aSize;
      uniform float uTime;uniform float uPR;uniform float uScale;uniform float uWarp;uniform float uWS;varying vec3 vCol;varying float vA;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);float tw=.6+.4*sin(uTime*(1.6+aSeed*2.2)+aSeed*60.0);
        vCol=mix(aColA,aColB,aW)*(1.0+aW*.35);float s=aSize*mix(1.0,uWS,aW)*(.75+.25*tw)*(1.0+uWarp*2.5);
        gl_PointSize=clamp(s*uPR*uScale*(58.0/max(-mv.z,.5)),0.0,72.0*uPR);vA=(.35+.65*tw)*mix(1.0,1.15,aW);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying vec3 vCol;varying float vA;void main(){vec2 c=gl_PointCoord-.5;float d=length(c);if(d>.5)discard;float a=pow(1.0-d*2.0,1.8);gl_FragColor=vec4(vCol*(1.0+(1.0-d*2.0)*.9),a*vA);}`,
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false
  });
  const points=new THREE.Points(pGeo,pMat);points.frustumCulled=false;scene.add(points);

  /* 불꽃(짧게 사는 알갱이) */
  const SN=tier.sparks;
  const SP={pos:new Float32Array(SN*3),vel:new Float32Array(SN*3),life:new Float32Array(SN),max:new Float32Array(SN),col:new Float32Array(SN*3),size:new Float32Array(SN),next:0};
  for(let i=0;i<SN;i++){SP.pos[i*3+1]=-999;}
  const sGeo=new THREE.BufferGeometry();
  const sPos=new THREE.BufferAttribute(SP.pos,3);sPos.setUsage(THREE.DynamicDrawUsage);
  const sLife=new THREE.BufferAttribute(SP.life,1);sLife.setUsage(THREE.DynamicDrawUsage);
  const sCol=new THREE.BufferAttribute(SP.col,3);sCol.setUsage(THREE.DynamicDrawUsage);
  const sSize=new THREE.BufferAttribute(SP.size,1);sSize.setUsage(THREE.DynamicDrawUsage);
  sGeo.setAttribute('position',sPos);sGeo.setAttribute('aLife',sLife);sGeo.setAttribute('aCol',sCol);sGeo.setAttribute('aSize',sSize);
  const sMat=new THREE.ShaderMaterial({
    uniforms:{uPR:{value:renderer.getPixelRatio()},uScale:{value:1}},
    vertexShader:`attribute float aLife;attribute vec3 aCol;attribute float aSize;uniform float uPR;uniform float uScale;varying vec3 vC;varying float vL;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vC=aCol;vL=aLife;gl_PointSize=clamp(aSize*uPR*uScale*(62.0/max(-mv.z,.5))*(.4+aLife*.8),0.0,56.0*uPR);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying vec3 vC;varying float vL;void main(){if(vL<=0.0)discard;vec2 c=gl_PointCoord-.5;float d=length(c);if(d>.5)discard;float a=pow(1.0-d*2.0,1.5)*min(1.0,vL*1.6);gl_FragColor=vec4(vC*(1.3+(1.0-d*2.0)),a);}`,
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false
  });
  const sparks=new THREE.Points(sGeo,sMat);sparks.frustumCulled=false;scene.add(sparks);
  function burst(p,count,cols,speed,up){
    for(let k=0;k<count;k++){
      const i=SP.next;SP.next=(SP.next+1)%SN;
      const u=Math.random()*2-1,a=Math.random()*Math.PI*2,s=Math.sqrt(1-u*u),sp=speed*(.35+Math.random()*.9);
      SP.pos[i*3]=p.x;SP.pos[i*3+1]=p.y;SP.pos[i*3+2]=p.z;
      SP.vel[i*3]=Math.cos(a)*s*sp;SP.vel[i*3+1]=u*sp+(up||0);SP.vel[i*3+2]=Math.sin(a)*s*sp;
      const c=cols[(Math.random()*cols.length)|0];SP.col[i*3]=c[0];SP.col[i*3+1]=c[1];SP.col[i*3+2]=c[2];
      SP.max[i]=SP.life[i]=.7+Math.random()*.9;SP.size[i]=1.2+Math.random()*2.2;
    }
  }
  const FIRE=[[[.18,.85,.77],[.85,.98,.96],[.3,1,.85]],[[1,.78,.3],[1,.93,.6],[1,.55,.25]],[[.6,.75,1],[.85,.9,1],[.4,.95,.95]],[[1,.5,.8],[1,.8,.95],[.7,.5,1]]];

  /* ── 모양 만들기: 로고 / 글자 ── */
  const formation={pts:null,M:0,until:0,active:false,z:0,kind:''};
  let heroScale=1,layout={W:1,H:1,stageCY:0,stageH:1,visH:1,visW:1};
  // 동물 그림(dayN.png) → 그 색 그대로 빛 알갱이 자리
  function animalFormation(img){
    if(!img||!img.width)return null;
    const ch=Math.min(320,img.height),cw=Math.round(ch*img.width/img.height);
    const raw=samplePoints(function(x,w,h){x.drawImage(img,0,0,w,h);},cw,ch,1);
    const step=Math.max(1,Math.round(Math.sqrt(raw.length/(N*.9))));
    const pts=[],H=ANIMAL_H*heroScale,Wd=H*cw/ch;
    for(let k=0;k<raw.length;k+=step){const p=raw[k];
      const r=p[2]/255*.48+.03,g=p[3]/255*.48+.03,b=p[4]/255*.48+.03; // 겹쳐 더해지므로 어둡게 줘야 제 색이 남음
      pts.push([(p[0]-.5)*Wd,-(p[1]-.5)*H+hero.position.y,(Math.random()-.5)*.3,[r,g,b]]);}
    return pts;
  }
  function wordFormation(word){
    const cw=1024,ch=300;
    const pts=samplePoints(function(x,w,h){
      let fs=200;x.font='800 '+fs+'px "Malgun Gothic","Apple SD Gothic Neo",sans-serif';
      const mw=x.measureText(word).width;if(mw>w*.94){fs=Math.floor(fs*w*.94/mw);x.font='800 '+fs+'px "Malgun Gothic","Apple SD Gothic Neo",sans-serif';}
      const g=x.createLinearGradient(0,0,w,0);g.addColorStop(0,'#2fd9c4');g.addColorStop(.5,'#eafffb');g.addColorStop(1,'#ffd36b');
      x.fillStyle=g;x.textAlign='center';x.textBaseline='middle';x.fillText(word,w/2,h/2);
    },cw,ch,tier.low?5:4);
    const z=-5.5,dist=camera.position.z-z,vh=2*Math.tan(baseFov*Math.PI/360)*dist,vw=vh*layout.W/layout.H;
    const width=Math.min(vw*.9,vh*2.4),height=width*ch/cw;
    const cy=hero.position.y+layout.visH*0.05;
    return pts.map(function(p){return [(p[0]-.5)*width,-(p[1]-.5)*height+cy,z+(Math.random()-.5)*.4,[p[2]/255,p[3]/255,p[4]/255]];});
  }
  function form(pts,dur,kind){
    if(!pts||!pts.length)return;
    const M=Math.min(pts.length,Math.floor(P.active*(kind==='animal'?.6:.62)));
    // 점이 더 많으면 고르게 덜어냄
    const stride=pts.length/M;
    for(let k=0;k<P.active;k++){
      const i=P.order[k];
      if(k<M){const p=pts[Math.floor(k*stride)];P.tgt[i*3]=p[0];P.tgt[i*3+1]=p[1];P.tgt[i*3+2]=p[2];P.colB[i*3]=p[3][0];P.colB[i*3+1]=p[3][1];P.colB[i*3+2]=p[3][2];P.des[i]=1;}
      else P.des[i]=0;
    }
    colBAttr.needsUpdate=true;
    pMat.uniforms.uWS.value=kind==='animal'?.75:1.5; // 동물 모양은 작은 점으로 또렷하게
    formation.active=true;formation.M=M;formation.until=clock+dur;formation.kind=kind;
  }
  function release(power){
    formation.active=false;
    for(let k=0;k<P.active;k++){const i=P.order[k];if(P.des[i]>0&&power){const x=P.pos[i*3],y=P.pos[i*3+1]-hero.position.y,z=P.pos[i*3+2];const L=Math.hypot(x,y,z)+.3;P.vel[i*3]+=x/L*power*(.5+Math.random());P.vel[i*3+1]+=y/L*power*(.5+Math.random());P.vel[i*3+2]+=(z/L+.4)*power*(.5+Math.random());}P.des[i]=0;}
  }
  let words=lines('intro.particle_words'),wordIdx=0,nextWordAt=9;

  /* ── 미니게임: 충치균 잡기 ── */
  function germTexture(hue){
    const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');
    x.translate(64,64);
    x.strokeStyle='hsl('+hue+',75%,62%)';x.lineWidth=7;x.lineCap='round';
    for(let i=0;i<9;i++){const a=i/9*Math.PI*2;x.beginPath();x.moveTo(Math.cos(a)*34,Math.sin(a)*34);x.lineTo(Math.cos(a)*54,Math.sin(a)*54);x.stroke();x.beginPath();x.arc(Math.cos(a)*55,Math.sin(a)*55,6,0,Math.PI*2);x.fillStyle='hsl('+hue+',80%,70%)';x.fill();}
    const g=x.createRadialGradient(-10,-12,4,0,0,44);g.addColorStop(0,'hsl('+hue+',90%,78%)');g.addColorStop(1,'hsl('+hue+',70%,40%)');
    x.beginPath();for(let i=0;i<=40;i++){const a=i/40*Math.PI*2,r=40+Math.sin(a*5)*3.5;x.lineTo(Math.cos(a)*r,Math.sin(a)*r);}x.fillStyle=g;x.fill();
    const eye=function(ex){x.beginPath();x.arc(ex,-6,11,0,Math.PI*2);x.fillStyle='#fff';x.fill();x.beginPath();x.arc(ex+2,-4,5.5,0,Math.PI*2);x.fillStyle='#1b1b2a';x.fill();x.beginPath();x.arc(ex+4,-7,2,0,Math.PI*2);x.fillStyle='#fff';x.fill();};
    eye(-14);eye(14);
    x.beginPath();x.arc(0,12,10,.15*Math.PI,.85*Math.PI);x.strokeStyle='#2a1030';x.lineWidth=4;x.stroke();
    x.beginPath();x.moveTo(-4,16);x.lineTo(-1,22);x.lineTo(2,16);x.fillStyle='#fff';x.fill();
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
  }
  const germTex=[germTexture(110),germTexture(285),germTexture(30),germTexture(195)];
  const germGroup=new THREE.Group();scene.add(germGroup);
  const game={on:false,t0:0,score:0,dur:15,germs:[],last:-1};
  function spawnGerm(){
    const ti=(Math.random()*germTex.length)|0;
    const m=new THREE.SpriteMaterial({map:germTex[ti],transparent:true,depthWrite:false});
    const s=new THREE.Sprite(m);
    const ar=layout.W/layout.H,spreadX=Math.min(4.6,3.0*ar+.6);
    s.position.set((Math.random()-.5)*2*spreadX,hero.position.y+(Math.random()-.5)*3.6,1+Math.random()*2.2);
    s.userData={vx:(Math.random()-.5)*2.4,vy:(Math.random()-.5)*2.0,ph:Math.random()*6,born:clock,hue:[[.4,1,.4],[.85,.4,1],[1,.6,.25],[.3,.9,1]][ti],base:.85+Math.random()*.35};
    s.scale.set(.01,.01,1);germGroup.add(s);game.germs.push(s);
  }
  function startGame(){
    if(game.on||leaving)return;
    game.on=true;game.t0=clock;game.score=0;
    hideSay();
    for(let i=0;i<(tier.low?6:8);i++)spawnGerm();
    toast(T('intro.game_hint'),1600);
    hud(true);
  }
  function endGame(){
    game.on=false;
    game.germs.forEach(function(s){burst(s.position,10,[s.userData.hue],3);germGroup.remove(s);s.material.dispose();});game.germs=[];
    hud(false);
    const k='hubIntro.best.'+(S.opts.userId||'me'),b=lsGet(k,{day:'',best:0}),today=ymd(new Date());
    const best=Math.max(game.score,b.day===today?b.best:0);lsSet(k,{day:today,best:best});
    toast(T('intro.game_result',{n:game.score,best:best}),2600);
    for(let i=0;i<5;i++)setTimeout(function(){if(!disposed)burst(new THREE.Vector3((Math.random()-.5)*6,hero.position.y+Math.random()*2.5,0),70,FIRE[(Math.random()*4)|0],5.5,1.2);},i*170);
  }
  const hudEl=el.querySelector('.hi-hud'),toastEl=el.querySelector('.hi-toast');
  function hud(onv){hudEl.style.opacity=onv?'1':'0';}
  let toastTimer=0;
  function toast(text,ms){toastEl.textContent=text;toastEl.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(function(){toastEl.classList.remove('on');},ms||2000);}

  /* ── 동물: 나타나기·누르기·요일 바꾸기 ── */
  const tweens=[];
  function tween(dur,fn,ez,delay){tweens.push({t0:clock+(delay||0),dur:dur,fn:fn,ez:ez||ease.outCubic,done:false});}
  let leaving=false,jumpY=0,spinExtra=0,dayToken=0;
  function dayFire(n){const c=hexRgb(DAY_COLORS[n]||DAY_COLORS[0]);return [c,[Math.min(1,c[0]*.5+.5),Math.min(1,c[1]*.5+.5),Math.min(1,c[2]*.5+.5)],[1,.97,.9]];}
  function popIn(){
    holder.visible=true;holder.scale.setScalar(.001);
    tween(1.3,function(e){holder.scale.setScalar(Math.max(.001,e));holder.rotation.y=(1-e)*-Math.PI*2;},ease.outElastic);
    release(7);burst(new THREE.Vector3(0,hero.position.y,0),tier.low?140:260,dayFire(curDay).concat(FIRE[1]),6.5,.4);
    el.querySelector('.hi-flash').style.opacity='.55';setTimeout(function(){const f=el.querySelector('.hi-flash');if(f)f.style.opacity='0';},180);
  }
  // 다른 요일: 지금 동물 작아짐 → 알갱이가 새 동물 모양 → 새 3D 등장
  function setDay(n){
    if(leaving)return;
    const tok=++dayToken;curDay=n;curReady=false;
    glowMat.color.set(DAY_COLORS[n]);rim.color.set(DAY_COLORS[n]);
    hideSay();
    const from=holder.scale.x;
    tween(.35,function(e){holder.scale.setScalar(Math.max(.001,from*(1-e)));},ease.inOutCubic);
    burst(new THREE.Vector3(0,hero.position.y,0),70,dayFire(n),4.5);
    const t0=clock;
    Promise.all([getPng(n),getAnimal(n)]).then(function(r){
      if(disposed||tok!==dayToken)return;
      form(animalFormation(r[0]),99,'animal');
      const wait=Math.max(0,1.3-(clock-t0))*1000;
      setTimeout(function(){if(disposed||tok!==dayToken)return;holder.visible=false;putAnimal(r[1]);cur=r[1];curReady=true;popIn();},wait);
    });
  }
  /* 하트·별(누르면 위로 퐁퐁) */
  function shapeTex(kind){
    const c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d');x.translate(48,50);x.fillStyle='#fff';x.beginPath();
    if(kind==='heart'){x.moveTo(0,30);x.bezierCurveTo(-46,0,-30,-40,0,-18);x.bezierCurveTo(30,-40,46,0,0,30);}
    else{for(let i=0;i<10;i++){const r=i%2?17:40,a=-Math.PI/2+i*Math.PI/5;x.lineTo(Math.cos(a)*r,Math.sin(a)*r);}}
    x.closePath();x.shadowColor='#fff';x.shadowBlur=8;x.fill();
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
  }
  const heartTex=shapeTex('heart'),starTex=shapeTex('star');
  const floatGroup=new THREE.Group();scene.add(floatGroup);
  const floaters=[];
  function spawnFloaters(p,count){
    const cols=[DAY_COLORS[curDay],'#ff6f9f','#ffd36b','#ffffff'];
    for(let k=0;k<count;k++){
      const heart=Math.random()<.55;
      const m=new THREE.SpriteMaterial({map:heart?heartTex:starTex,color:new THREE.Color(cols[(Math.random()*cols.length)|0]),transparent:true,depthWrite:false});
      const s=new THREE.Sprite(m);s.position.copy(p);s.position.x+=(Math.random()-.5)*.8;
      const sc=(.28+Math.random()*.3)*heroScale;s.scale.set(sc,sc,1);
      s.userData={vx:(Math.random()-.5)*2.6,vy:2.2+Math.random()*2.2,vz:(Math.random()-.5)*1.2,life:1.4+Math.random()*.6,max:0,rs:(Math.random()-.5)*3,sc:sc};
      s.userData.max=s.userData.life;floatGroup.add(s);floaters.push(s);
    }
  }
  /* 말풍선 */
  const sayEl=el.querySelector('.hi-say');let sayUntil=0;const sayIdx={};
  function showSay(){
    const L=lines('intro.day'+curDay+'_say');if(!L.length)return;
    const i=sayIdx[curDay]||0;sayIdx[curDay]=i+1;
    sayEl.textContent=L[i%L.length];sayEl.classList.add('on');sayUntil=clock+2.8;
  }
  function hideSay(){sayUntil=0;sayEl.classList.remove('on');}
  const tmpV=new THREE.Vector3();
  function placeSay(){
    if(!sayUntil)return;
    if(clock>sayUntil){hideSay();return;}
    tmpV.set(0,animalTop+.25,0);holder.localToWorld(tmpV);tmpV.project(camera);
    const x=(tmpV.x+1)/2*layout.W,y=(1-tmpV.y)/2*layout.H;
    const w=sayEl.offsetWidth,h=sayEl.offsetHeight;
    sayEl.style.transform='translate('+clamp(x-w/2,8,layout.W-w-8).toFixed(1)+'px,'+Math.max(8,y-h-14).toFixed(1)+'px)';
  }
  // 동물을 눌렀을 때: 점프 + 한 바퀴 + 하트·별 + 말풍선
  let pokeBusy=false;
  function poke(){
    if(pokeBusy||!curReady)return;pokeBusy=true;
    tween(.95,function(e){jumpY=Math.sin(Math.PI*e)*1.1;spinExtra=e*Math.PI*2;if(e>=1){jumpY=0;spinExtra=0;pokeBusy=false;}},ease.inOutCubic);
    tmpV.set(0,animalTop,0);holder.localToWorld(tmpV);
    spawnFloaters(tmpV.clone(),tier.low?8:14);
    burst(tmpV.clone(),tier.low?50:90,dayFire(curDay),4,1);
    showSay();
  }

  /* ── 입력 ── */
  const ray=new THREE.Raycaster();const ndc=new THREE.Vector2(-9,-9);
  const ptr={x:-9999,y:-9999,inside:false,down:false,sx:0,sy:0,lx:0,ly:0,moved:false,t:0,id:null,onHero:false};
  let yawVel=0,pitchVel=0,userYaw=0,userPitch=0;
  const well={on:false,p:new THREE.Vector3(),str:0};
  const mouseRay={o:new THREE.Vector3(),d:new THREE.Vector3(0,0,-1),on:false};
  const planeP=function(z,out){const t=(z-ray.ray.origin.z)/ray.ray.direction.z;return out.copy(ray.ray.direction).multiplyScalar(t).add(ray.ray.origin);};
  function setNdc(e){const r=canvas.getBoundingClientRect();ndc.x=((e.clientX-r.left)/r.width)*2-1;ndc.y=-((e.clientY-r.top)/r.height)*2+1;ray.setFromCamera(ndc,camera);mouseRay.o.copy(ray.ray.origin);mouseRay.d.copy(ray.ray.direction);mouseRay.on=true;}
  function heroHit(){
    const objs=[];heroSpin.traverse(function(o){if(o.isMesh&&o.userData.hit&&o.visible)objs.push(o);});
    return ray.intersectObjects(objs,false).length>0;
  }
  function germHit(){
    if(!game.on)return null;const h=ray.intersectObjects(game.germs,false);return h.length?h[0].object:null;
  }
  const L=[];const listen=function(t,ev,fn,o){t.addEventListener(ev,fn,o);L.push([t,ev,fn,o]);};
  listen(canvas,'pointerdown',function(e){
    if(S.editing)return;
    setNdc(e);ptr.down=true;ptr.moved=false;ptr.sx=ptr.lx=e.clientX;ptr.sy=ptr.ly=e.clientY;ptr.t=clock;ptr.id=e.pointerId;
    const g=germHit();
    if(g){popGerm(g);ptr.down=false;return;}
    ptr.onHero=heroHit();
    try{canvas.setPointerCapture(e.pointerId);}catch(_){}
  });
  listen(canvas,'pointermove',function(e){
    setNdc(e);ptr.x=e.clientX;ptr.y=e.clientY;ptr.inside=true;
    if(!ptr.down)return;
    const dx=e.clientX-ptr.lx,dy=e.clientY-ptr.ly;ptr.lx=e.clientX;ptr.ly=e.clientY;
    if(Math.hypot(e.clientX-ptr.sx,e.clientY-ptr.sy)>7)ptr.moved=true;
    if(ptr.moved&&!well.on){canvas.classList.add('drag');yawVel=dx*.012;pitchVel=dy*.008;userYaw+=dx*.012;userPitch=clamp(userPitch+dy*.008,-.7,.7);}
    if(well.on)planeP(-1,well.p);
  });
  const up=function(e){
    if(!ptr.down)return;ptr.down=false;canvas.classList.remove('drag');
    try{canvas.releasePointerCapture(e.pointerId);}catch(_){}
    if(well.on){
      well.on=false;
      shock(well.p,10+well.str*14);burst(well.p,Math.round(80+well.str*160),FIRE[(Math.random()*4)|0],5+well.str*6,1);
      return;
    }
    if(ptr.moved)return;
    if(game.on){burst(planeP(1.5,new THREE.Vector3()),14,[[1,1,1],[.6,1,.9]],2.2);return;} // 게임 중 헛손질은 작은 반짝임만
    if(ptr.onHero){
      poke();
    }else{
      const p=planeP(.5,new THREE.Vector3());
      burst(p,tier.low?70:120,FIRE[(Math.random()*4)|0],5.5,1.0);shock(p,5);
    }
  };
  listen(canvas,'pointerup',up);listen(canvas,'pointercancel',function(e){ptr.down=false;well.on=false;canvas.classList.remove('drag');});
  listen(canvas,'pointerleave',function(){ptr.inside=false;mouseRay.on=false;});
  function popGerm(g){
    burst(g.position,tier.low?40:70,[g.userData.hue,[1,1,1],[1,.95,.6]],4.5,.6);
    shock(g.position,3);
    game.score++;
    germGroup.remove(g);g.material.dispose();
    game.germs.splice(game.germs.indexOf(g),1);
    if(game.on)setTimeout(function(){if(game.on&&!disposed)spawnGerm();},250+Math.random()*450);
  }
  function shock(p,power){
    for(let k=0;k<P.active;k++){const i=P.order[k];const dx=P.pos[i*3]-p.x,dy=P.pos[i*3+1]-p.y,dz=P.pos[i*3+2]-p.z,d2=dx*dx+dy*dy+dz*dz;
      if(d2<49){const d=Math.sqrt(d2)+.2,f=power*(1-d/7)/d;P.vel[i*3]+=dx*f;P.vel[i*3+1]+=dy*f;P.vel[i*3+2]+=dz*f;}}
  }
  // 기기 기울기(허락 없이 오는 경우만) — 가벼운 시차
  let tiltX=0,tiltY=0;
  listen(root,'deviceorientation',function(e){if(e.gamma==null)return;tiltX=clamp(e.gamma/45,-1,1);tiltY=clamp((e.beta-45)/45,-1,1);});

  /* ── 크기 맞추기 ── */
  const stageEl=el.querySelector('.hi-stage');
  function resize(){
    const W=el.clientWidth||innerWidth,H=el.clientHeight||innerHeight;
    renderer.setSize(W,H,false);
    camera.aspect=W/H;
    const sr=stageEl.getBoundingClientRect(),er=el.getBoundingClientRect();
    const stageCY=(sr.top-er.top)+sr.height/2,stageH=Math.max(120,sr.height);
    camera.setViewOffset(W,H,0,H/2-stageCY,W,H);
    camera.updateProjectionMatrix();
    const dist=camera.position.z,visH=2*Math.tan(camera.fov*Math.PI/360)*dist;
    layout={W:W,H:H,stageCY:stageCY,stageH:stageH,visH:visH,visW:visH*W/H};
    const wantH=stageH/H*visH*.92,wantW=layout.visW*.8;
    heroScale=clamp(Math.min(wantH/4.1,wantW/4.4),.3,1.5);
    hero.scale.setScalar(heroScale);
    const sc=Math.min(1.3,Math.max(.75,H/820));pMat.uniforms.uScale.value=sc;sMat.uniforms.uScale.value=sc;
  }
  const ro=root.ResizeObserver?new ResizeObserver(resize):null;if(ro)ro.observe(el);else listen(root,'resize',resize);
  resize();

  /* ── 매 프레임 ── */
  let clock=0,last=performance.now(),raf=0,paused=false,disposed=false,warpT=-1,warpDone=null;
  let perfN=0,perfSum=0,perfStage=0;
  const tmpD=new THREE.Vector3();
  function step(dt){
    clock+=dt;
    const t=clock;
    // 인트로 순서: 0.15초 오늘 동물 그림 모양으로 모임 → 3초(3D가 준비되면) 입체 동물 등장, 알갱이 흩어짐
    if(t>.15&&!S._formed){S._formed=true;form(animalFormation(dayImg),2.4,'animal');}
    if(!S._logoIn&&formation.active&&formation.kind==='animal')formation.until=Math.max(formation.until,t+.2); // 3D 기다리는 동안 모양 유지
    if(t>3&&!S._logoIn&&(curReady||t>9)){S._logoIn=true;if(cur)putAnimal(cur);popIn();}
    if(formation.active&&t>formation.until)release(formation.kind==='word'?2.5:0);
    if(S._logoIn&&!game.on&&warpT<0&&t>nextWordAt&&words.length){
      form(wordFormation(words[wordIdx%words.length]),3.4,'word');wordIdx++;nextWordAt=t+10.5;
    }
    // 트윈
    for(let i=tweens.length-1;i>=0;i--){const w=tweens[i];if(t<w.t0)continue;const e=clamp((t-w.t0)/w.dur,0,1);w.fn(w.ez(e));if(e>=1)tweens.splice(i,1);}
    // 영웅 회전
    if(!ptr.down){userYaw+=yawVel;userPitch=clamp(userPitch+pitchVel,-.7,.7);yawVel*=.93;pitchVel*=.9;userPitch*=.985;}
    heroSpin.rotation.y=Math.sin(t*.55)*.35+userYaw+spinExtra;
    heroSpin.rotation.x=userPitch*.6+Math.sin(t*.7)*.04;
    hero.position.y=Math.sin(t*1.1)*.06;
    heroSpin.position.y=jumpY;
    holder.children.forEach(function(a){a.scale.y=1+Math.sin(t*2.2)*.012;}); // 숨쉬기
    // 시차
    const px=mouseRay.on?ndc.x:tiltX*.6,py=mouseRay.on?ndc.y:-tiltY*.4;
    camera.position.x+=(px*.9-camera.position.x)*.04;camera.position.y+=(py*.6-camera.position.y)*.04;
    camera.lookAt(0,0,-2);
    aura.material.opacity=.22+Math.sin(t*1.7)*.06+(well.on?.15:0);
    gold.position.set(Math.cos(t*.8)*5,Math.sin(t*.6)*2.5,Math.sin(t*.8)*5);
    rim.position.set(Math.cos(t*.5+2)*6,2.5,Math.sin(t*.5+2)*4-2);
    // 꾹 누르기 → 블랙홀
    if(ptr.down&&!ptr.moved&&!ptr.onHero&&!well.on&&!game.on&&t-ptr.t>.38){well.on=true;well.str=0;planeP(-1,well.p);}
    if(well.on){well.str=Math.min(1,well.str+dt*.6);if(Math.random()<.6)burst(well.p,2,[[.6,1,.95],[1,.9,.6]],1.2);}
    // 알갱이
    const A=P.active,dts=Math.min(dt,.05),damp=Math.exp(-3.2*dts),warping=warpT>=0;
    const mo=mouseRay.on&&!warping,ox=mouseRay.o.x,oy=mouseRay.o.y,oz=mouseRay.o.z,dx0=mouseRay.d.x,dy0=mouseRay.d.y,dz0=mouseRay.d.z;
    const gc=Math.cos(1.08),gs=Math.sin(1.08);
    for(let k=0;k<A;k++){
      const i=P.order[k],i3=i*3;
      let tx,ty,tz;
      if(P.kind[i]===1){
        tx=P.r[i]+Math.sin(t*.15+P.seed[i]*20)*.6;ty=((P.h[i]+t*P.spd[i]+7)%14+14)%14-7;tz=P.th[i];
      }else{
        const a=P.th[i]+t*P.spd[i],r=P.r[i];
        const gx=Math.cos(a)*r,gz=Math.sin(a)*r*.55,gy=P.h[i];
        tx=gx;ty=gy*gc-gz*gs-.6;tz=gy*gs+gz*gc-7;
      }
      // 모양 쪽으로 섞기
      const dw=P.des[i]-P.w[i];
      if(dw!==0){const rate=P.des[i]>0?(1.2+P.seed[i]*2.4):1.6;P.w[i]+=dw*Math.min(1,dts*rate);if(Math.abs(P.des[i]-P.w[i])<.002)P.w[i]=P.des[i];}
      const w=P.w[i];
      if(w>0){tx+=(P.tgt[i3]-tx)*w;ty+=(P.tgt[i3+1]-ty)*w;tz+=(P.tgt[i3+2]-tz)*w;}
      const kk=w>0?(2.2+w*9):1.4;
      let vx=P.vel[i3],vy=P.vel[i3+1],vz=P.vel[i3+2];
      const x=P.pos[i3],y=P.pos[i3+1],z=P.pos[i3+2];
      vx+=(tx-x)*kk*dts;vy+=(ty-y)*kk*dts;vz+=(tz-z)*kk*dts;
      if(mo){
        const qx=x-ox,qy=y-oy,qz=z-oz,tt=qx*dx0+qy*dy0+qz*dz0;
        const cx=qx-dx0*tt,cy=qy-dy0*tt,cz=qz-dz0*tt,d2=cx*cx+cy*cy+cz*cz;
        if(d2<2.4){const d=Math.sqrt(d2)+.05,f=(1-d/1.55)*26*dts/d;vx+=cx*f;vy+=cy*f;vz+=cz*f*.5;}
      }
      if(well.on){
        const wx=well.p.x-x,wy=well.p.y-y,wz=well.p.z-z,d2=wx*wx+wy*wy+wz*wz+.6,f=(5+well.str*22)*dts/d2*Math.min(4,Math.sqrt(d2));
        vx+=wx*f-wy*f*.9;vy+=wy*f+wx*f*.9;vz+=wz*f;
      }
      if(warping){vz+=(28+warpT*90)*dts;}
      vx*=damp;vy*=damp;vz*=damp;
      let nx=x+vx*dts,ny=y+vy*dts,nz=z+vz*dts;
      if(warping&&nz>camera.position.z-.3){nz=-45-Math.random()*10;nx=(Math.random()-.5)*30;ny=(Math.random()-.5)*20;vz=0;}
      P.pos[i3]=nx;P.pos[i3+1]=ny;P.pos[i3+2]=nz;P.vel[i3]=vx;P.vel[i3+1]=vy;P.vel[i3+2]=vz;
    }
    posAttr.needsUpdate=true;wAttr.needsUpdate=true;
    // 불꽃
    const sd=Math.exp(-1.6*dts);
    for(let i=0;i<SN;i++){
      if(SP.life[i]<=0)continue;
      SP.life[i]-=dts;const i3=i*3;
      SP.vel[i3+1]-=3.2*dts;SP.vel[i3]*=sd;SP.vel[i3+1]*=sd;SP.vel[i3+2]*=sd;
      SP.pos[i3]+=SP.vel[i3]*dts;SP.pos[i3+1]+=SP.vel[i3+1]*dts;SP.pos[i3+2]+=SP.vel[i3+2]*dts;
      if(SP.life[i]<=0){SP.life[i]=0;SP.pos[i3+1]=-999;}
    }
    sPos.needsUpdate=true;sLife.needsUpdate=true;sCol.needsUpdate=true;sSize.needsUpdate=true;
    // 게임
    if(game.on){
      const left=Math.max(0,game.dur-(t-game.t0));
      hudEl.textContent=T('intro.game_score',{n:game.score,s:Math.ceil(left)});
      const ar=layout.W/layout.H,bx=Math.min(4.8,3.1*ar+.6);
      game.germs.forEach(function(s){
        const u=s.userData,age=t-u.born,grow=Math.min(1,age*3),wob=1+Math.sin(t*6+u.ph)*.08;
        s.scale.set(u.base*grow*wob*heroScale,u.base*grow/wob*heroScale,1);
        s.position.x+=u.vx*dts;s.position.y+=u.vy*dts+Math.sin(t*2+u.ph)*.01;
        if(Math.abs(s.position.x)>bx)u.vx=-u.vx;
        if(Math.abs(s.position.y-hero.position.y)>2.2*Math.max(.8,heroScale))u.vy=-u.vy;
        s.material.rotation=Math.sin(t*3+u.ph)*.25;
      });
      if(left<=0)endGame();
    }
    // 들어가기(워프)
    if(warping){
      warpT+=dt;
      camera.fov=baseFov+ease.inOutCubic(Math.min(1,warpT/.9))*58;camera.updateProjectionMatrix();
      pMat.uniforms.uWarp.value=Math.min(1,warpT*1.4);
      hero.scale.setScalar(heroScale*Math.max(.001,1-ease.inOutCubic(Math.min(1,warpT/.6))));
      heroSpin.rotation.y+=dt*8*warpT;
      if(warpT>.62&&!S._flashed){S._flashed=true;const f=el.querySelector('.hi-flash');f.style.transition='opacity .25s';f.style.opacity='.9';}
      if(warpT>.85&&warpDone){const d=warpDone;warpDone=null;d();}
    }
    pMat.uniforms.uTime.value=t;
    // 하트·별
    for(let i=floaters.length-1;i>=0;i--){const f=floaters[i],u=f.userData;u.life-=dts;
      if(u.life<=0){floatGroup.remove(f);f.material.dispose();floaters.splice(i,1);continue;}
      u.vy-=1.6*dts;f.position.x+=u.vx*dts;f.position.y+=u.vy*dts;f.position.z+=u.vz*dts;f.material.rotation+=u.rs*dts;
      const lf=u.life/u.max,sc=u.sc*(lf>.85?(1-lf)/.15:1);f.scale.set(sc,sc,1);f.material.opacity=Math.min(1,lf*1.8);}
    placeSay();
  }
  function frame(now){
    raf=0;if(disposed||paused)return;
    const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
    step(dt);
    renderer.render(scene,camera);
    // 느리면 스스로 낮춤
    if(clock>3.2&&perfStage<2&&warpT<0){perfN++;perfSum+=dt;if(perfN>=90){const avg=perfSum/perfN;perfN=0;perfSum=0;
      if(avg>1/38){perfStage++;renderer.setPixelRatio(Math.max(1,renderer.getPixelRatio()*.7));pMat.uniforms.uPR.value=sMat.uniforms.uPR.value=renderer.getPixelRatio();
        P.active=Math.max(1500,Math.floor(P.active*.62));pGeo.setDrawRange(0,N);hideInactive();resize();}}}
    raf=requestAnimationFrame(frame);
  }
  function hideInactive(){for(let k=P.active;k<N;k++){const i=P.order[k];P.pos[i*3+1]=-999;P.pos[i*3+2]=-999;P.size[i]=0;}pGeo.attributes.aSize.needsUpdate=true;posAttr.needsUpdate=true;}
  if(tier.reduced){P.active=Math.floor(N*.5);hideInactive();}
  raf=requestAnimationFrame(frame);

  return {
    reduced:tier.reduced,
    dbg:function(){return {clock:clock,heroScale:heroScale,day:curDay,ready:curReady,shown:holder.visible,holderScale:holder.scale.x,kids:holder.children.length,flat:!!(cur&&cur.userData.flat),active:P.active,form:formation.active,pr:renderer.getPixelRatio(),calls:renderer.info.render.calls,poke:pokeBusy,say:sayEl.textContent};},
    poke:poke,
    setDay:setDay,
    startGame:startGame,
    setWords:function(w){words=w&&w.length?w:words;},
    setPaused:function(p){paused=!!p;if(!paused&&!disposed&&!raf){last=performance.now();raf=requestAnimationFrame(frame);}},
    warp:function(done){
      if(game.on){game.on=false;game.germs.forEach(function(s){germGroup.remove(s);s.material.dispose();});game.germs=[];hud(false);}
      leaving=true;hideSay();warpDone=done;warpT=0;release(0);
      el.querySelector('.hi-ui').style.transition='opacity .4s';el.querySelector('.hi-ui').style.opacity='0';
      if(paused||document.hidden){const d=warpDone;warpDone=null;d();}
    },
    dispose:function(){
      disposed=true;if(raf)cancelAnimationFrame(raf);raf=0;
      L.forEach(function(a){a[0].removeEventListener(a[1],a[2],a[3]);});
      if(ro)ro.disconnect();
      clearTimeout(toastTimer);
      scene.traverse(function(o){if(o.geometry)o.geometry.dispose();if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(function(m){if(m.map)m.map.dispose();m.dispose();});}});
      germTex.forEach(function(t){t.dispose();});dotTex.dispose();heartTex.dispose();starTex.dispose();envRT.dispose();
      Object.keys(glbCache).forEach(function(k){glbCache[k].then(function(a){if(a)a.traverse(function(o){if(o.geometry)o.geometry.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(function(m){if(m.map)m.map.dispose();m.dispose();});});});});
      renderer.dispose();try{renderer.forceContextLoss();}catch(e){}
    }
  };
}

/* ── 대신 쓰는 가벼운 2D(WebGL·three를 못 쓸 때) ── */
function makeFallback(S,tier,replaceCanvas){
  const el=S.el;let canvas=el.querySelector('canvas.hi-gl');
  if(replaceCanvas){const c=document.createElement('canvas');c.className='hi-gl';canvas.parentNode.replaceChild(c,canvas);canvas=c;}
  const x=canvas.getContext('2d');
  const n=tier.low?260:520,pts=[];
  for(let i=0;i<n;i++)pts.push({x:Math.random(),y:Math.random(),vx:0,vy:0,s:.6+Math.random()*2,c:['#2fd9c4','#eafffb','#e3b341','#6fb2ff'][(Math.random()*4)|0]});
  const img=new Image();img.src=dayPng(S.day);
  let W=1,H=1,raf=0,disposed=false,paused=false,mx=-9,my=-9,t=0,last=performance.now();
  const sparks=[];
  const resize=function(){const pr=Math.min(devicePixelRatio||1,2);W=el.clientWidth;H=el.clientHeight;canvas.width=W*pr;canvas.height=H*pr;x.setTransform(pr,0,0,pr,0,0);};
  resize();addEventListener('resize',resize);
  const mv=function(e){mx=e.clientX;my=e.clientY;};
  const dn=function(e){for(let i=0;i<60;i++){const a=Math.random()*6.28,s=1+Math.random()*4;sparks.push({x:e.clientX,y:e.clientY,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:1,c:pts[i%n].c});}};
  canvas.addEventListener('pointermove',mv);canvas.addEventListener('pointerdown',dn);
  const stage=el.querySelector('.hi-stage');
  const loop=function(now){
    raf=0;if(disposed||paused)return;const dt=Math.min(.05,(now-last)/1000);last=now;t+=dt;
    x.clearRect(0,0,W,H);
    x.globalCompositeOperation='lighter';
    pts.forEach(function(p){
      const px=p.x*W,py=p.y*H,dx=px-mx,dy=py-my,d=Math.hypot(dx,dy);
      if(d<110){p.vx+=dx/d*.6;p.vy+=dy/d*.6;}
      p.vx*=.94;p.vy*=.94;p.x+=(p.vx/W)+Math.sin(t*.3+p.s)*0.0002;p.y+=(p.vy/H)-0.00025*p.s;
      if(p.y<-.02)p.y=1.02;if(p.x<-.02)p.x=1.02;if(p.x>1.02)p.x=-.02;
      x.globalAlpha=.4+.4*Math.sin(t*2+p.s*9);x.fillStyle=p.c;x.beginPath();x.arc(p.x*W,p.y*H,p.s,0,6.28);x.fill();
    });
    for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.x+=s.vx;s.y+=s.vy;s.vy+=.08;s.l-=dt*1.2;if(s.l<=0){sparks.splice(i,1);continue;}x.globalAlpha=s.l;x.fillStyle=s.c;x.beginPath();x.arc(s.x,s.y,2,0,6.28);x.fill();}
    x.globalCompositeOperation='source-over';x.globalAlpha=1;
    if(img.complete&&img.naturalWidth){
      const sr=stage.getBoundingClientRect(),er=el.getBoundingClientRect(),h=Math.min(sr.height*.8,W*.5),w=h*img.naturalWidth/img.naturalHeight;
      const cx=W/2,cy=sr.top-er.top+sr.height/2;
      x.save();x.translate(cx,cy+Math.sin(t*1.2)*5);x.rotate(Math.sin(t*.9)*.04);x.shadowColor=DAY_COLORS[S.day]||'#fff';x.shadowBlur=30;x.drawImage(img,-w/2,-h/2,w,h);x.restore();
    }
    raf=requestAnimationFrame(loop);
  };
  raf=requestAnimationFrame(loop);
  // 2D에선 게임·조작 안내를 숨김(요일 단추는 그림만 바꿈)
  el.querySelectorAll('[data-game],[data-ik="intro.model_hint"]').forEach(function(b){b.style.display='none';});
  return {reduced:true,startGame:function(){},setWords:function(){},
    setDay:function(n){img.src=dayPng(n);},
    setPaused:function(p){paused=!!p;if(!paused&&!disposed&&!raf){last=performance.now();raf=requestAnimationFrame(loop);}},
    warp:function(d){d();},
    dispose:function(){disposed=true;if(raf)cancelAnimationFrame(raf);removeEventListener('resize',resize);canvas.removeEventListener('pointermove',mv);canvas.removeEventListener('pointerdown',dn);}};
}

root.HubIntro={
  shouldShow:shouldShow,
  show:show,
  open:function(opts){return show(opts);},
  close:function(){if(CURRENT)enter(CURRENT);},
  _dbg:function(){return CURRENT&&CURRENT.g&&CURRENT.g.dbg?CURRENT.g.dbg():null;},
  defs:DEFS
};
})(typeof window!=='undefined'?window:globalThis);

/* hub-texts.js — 직원허브 「⚙️ 허브 설정」(원장 전용) + 허브 전체 글·숫자·목록 덮어쓰기 엔진 (차례 1)
   설계서: Z:\09_claude-output\03_병원운영·전산\직원AI도우미\설계서_허브문구전체.md
   원리(AI 도우미 「📝 안내 문구」와 같음): 화면 코드에 지금 글을 「기본값」으로 남기고, 표에 같은 키가 있으면 그 값으로 바꿔 보여 준다.
   표를 못 읽으면 기본값 그대로(화면이 깨지지 않음). 「기본으로 되돌리기」 = 표의 그 행을 지움(app_settings는 지울 수 없어 기본값을 다시 적음).
   · 글  → 표 hub_ui_texts(db/hub_ui_texts.sql) · 숫자·목록 → 이미 있는 표 app_settings(키만 더함, 표·정책은 안 고침)
   hr.html은 이 파일을 main 스크립트보다 먼저 <script src="hub-texts.js?v=…"> 로 불러온다(함수는 전역 hubText·hubSetting·hubList·HubUi).
   로그인 전 화면 글은 표를 읽을 수 없어 이 엔진을 쓰지 않는다(설계서 5장).
   © 2026 Jung · 아산정플란트치과 */
(function(root){
'use strict';

/* hub-texts:test-start */
/* 아래 블록은 DOM·네트워크에 의존하지 않는 순수 함수와 기본값 목록만 둔다(hr.html의 test-start/end 패턴과 동일).
   tests/hub-ui-texts.test.js 가 이 블록만 vm으로 불러 시험한다. */

const HUB_KEY_RE=/^[a-z][a-z0-9_.]{1,80}$/;
const HUB_TEXT_MAX=20000;

function hubEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* ── 글(표 hub_ui_texts) ── */
let HUB_TEXT_OVERRIDES={};
function hubTextSetOverrides(rows){
  const next={};
  (Array.isArray(rows)?rows:[]).forEach(function(r){
    if(r&&typeof r.key==='string'&&typeof r.value==='string'&&r.value.trim()!=='')next[r.key]=r.value;
  });
  HUB_TEXT_OVERRIDES=next;
}
function hubTextOverride(key){
  const has=Object.prototype.hasOwnProperty.call(HUB_TEXT_OVERRIDES,key);
  const v=has?HUB_TEXT_OVERRIDES[key]:null;
  return (typeof v==='string'&&v.trim()!=='')?v:null;
}
function hubTextPutOverride(key,value){const next=Object.assign({},HUB_TEXT_OVERRIDES);next[key]=value;HUB_TEXT_OVERRIDES=next;}
function hubTextDropOverride(key){const next=Object.assign({},HUB_TEXT_OVERRIDES);delete next[key];HUB_TEXT_OVERRIDES=next;}
// {이름} 자리표시자를 값으로 바꾼다. vars에 없는 자리표시자는 그대로 둔다.
function hubFill(text,vars){
  if(!vars)return String(text);
  return String(text).replace(/\{([a-z_]+)\}/g,function(m,k){return Object.prototype.hasOwnProperty.call(vars,k)?String(vars[k]):m;});
}
// 화면 글: 표에 값이 있으면 그 글, 없으면(또는 읽기 실패) 코드의 기본값.
function hubText(key,def,vars){const v=hubTextOverride(key);return hubFill(v==null?def:v,vars);}
// HTML 안에 줄바꿈이 있는 긴 글을 넣을 때: 글자는 이스케이프하고 줄바꿈만 <br>로.
function hubTextHtml(key,def,vars){return hubEsc(hubText(key,def,vars)).replace(/\r?\n/g,'<br>');}

/* ── 숫자·목록(표 app_settings) — 호스트(hr.html)의 SETTINGS 객체를 그대로 가리킨다 ── */
let HUB_SETTING_VALUES={};
function hubSettingSetValues(obj){HUB_SETTING_VALUES=(obj&&typeof obj==='object')?obj:{};}
function hubSetting(key,def){
  const v=HUB_SETTING_VALUES[key];
  return (typeof v==='string'&&v.trim()!=='')?v:def;
}
function hubSettingNumber(key,def){
  const n=Number(hubSetting(key,String(def)));
  return Number.isFinite(n)?n:def;
}
// 목록: [{code,label}]. 코드는 고정이고 보이는 이름(label)만 고친다. 모양이 틀리면 기본 목록.
function hubListParse(raw){
  let a;
  try{a=JSON.parse(raw);}catch(e){return null;}
  if(!Array.isArray(a)||!a.length)return null;
  const seen={},out=[];
  for(let i=0;i<a.length;i++){
    const it=a[i];
    if(!it||typeof it.code!=='string'||typeof it.label!=='string')return null;
    const code=it.code.trim(),label=it.label.trim();
    if(!code||!label||code.length>40||label.length>40||seen[code])return null;
    seen[code]=true;out.push({code:code,label:label});
  }
  return out;
}
function hubList(key,defItems){
  const def=(defItems||[]).map(function(i){return {code:i.code,label:i.label};});
  const raw=HUB_SETTING_VALUES[key];
  if(typeof raw!=='string'||raw.trim()==='')return def;
  const stored=hubListParse(raw);
  if(!stored)return def;
  const byCode={};stored.forEach(function(i){byCode[i.code]=i;});
  const out=def.map(function(d){return {code:d.code,label:byCode[d.code]?byCode[d.code].label:d.label};});
  const defCodes={};def.forEach(function(d){defCodes[d.code]=true;});
  stored.forEach(function(i){if(!defCodes[i.code])out.push({code:i.code,label:i.label});});
  return out;
}

/* ── 기본값 목록: 키·어디에 보이는지·기본 글. 화면 코드(hr.html)의 기본값과 같아야 한다(시험이 대조). ── */
const HUB_TAB_DEFAULTS=[
  ['home','홈'],['ai','🤖 AI 도우미'],['att','출퇴근'],['deposit','입금'],['sched','근무표'],['leave','연차'],['appr','결재함'],['notice','공지'],
  ['workdocs','📚 업무자료'],['calendar','📅 캘린더'],['suggestions','💡 건의함'],['onbo','내 서류함'],['confid','진료기록'],['inbox','📥 문의함'],
  ['consult','🗂 상담일지'],['contract','근로계약서'],['pay','💰 급여'],['aicost','💰 AI비용'],['owner','🛡️ 계정·권한 관리'],['ownerboards','📒 원장 보기판'],['hubset','⚙️ 허브 설정']
];
const HUB_MENU_DEFAULTS=[['g_work','🕘 근무'],['g_owner','🔒 원장 전용'],['g_care','🩺 환자관리·진료'],['g_docs','🏖 연차·결재·서류']];
const HUB_INVITE_DEFAULT='아산정플란트치과 직원허브 가입 안내입니다.\n\n1) 아래 링크로 접속해 회원가입 해주세요.\nhttps://jung-plant.com/hr.html\n2) 회원가입 후 원장 승인을 기다려 주세요.\n3) 승인되면 같은 링크에서 로그인하시면 됩니다.';
const HUB_NEXT_BODY_DEFAULT='M2 근무표·계약서 자동생성 · M3 급여 대시보드/명세서 발행·월말 평가·휴일근로 계산기 · M4 채용·입금피드·기공차트 통합\n— 백엔드(표)는 이미 준비됨. 화면만 순차 추가.';
let HUB_TEXT_DEFS_CACHE=null;
function hubTextDefs(){
  if(HUB_TEXT_DEFS_CACHE)return HUB_TEXT_DEFS_CACHE;
  const defs=[];
  const add=function(key,screen,where,def,vars){defs.push({key:key,screen:screen,where:where,def:String(def),vars:vars||null});};
  HUB_TAB_DEFAULTS.forEach(function(t){add('tab.'+t[0],'공통 · 탭 이름','허브 맨 위·아래 메뉴 단추 — 「'+t[1]+'」 탭 이름',t[1]);});
  HUB_MENU_DEFAULTS.forEach(function(g){add('menu.'+g[0],'공통 · 메뉴 묶음 이름','허브 맨 위 메뉴 — 「'+g[1]+'」 묶음 이름',g[1]);});
  const S='🛡️ 계정·권한 관리';
  add('owner.title',S,'화면 맨 위 큰 제목','🛡️ 계정·권한 관리');
  add('owner.roster.label',S,'맨 위 칸 — 직원 명부 인원 위 작은 이름','직원 명부');
  add('owner.pending.title',S,'「미가입자·승인 대기」 묶음 제목','🧩 미가입자·승인 대기');
  add('owner.pending.hint',S,'「미가입자·승인 대기」 묶음 제목 아래 설명','근무명부에는 있지만 계정이 없는 사람과, 가입 후 원장 승인을 기다리는 사람을 모았습니다.');
  add('owner.invite.button',S,'「가입 안내 문구 복사」 단추 글','가입 안내 문구 복사');
  add('owner.invite.message',S,'★ 가입 안내 카톡 글 — 위 단추를 누르면 복사되는 글(새 직원에게 그대로 보냄)',HUB_INVITE_DEFAULT);
  add('owner.invite.copied',S,'가입 안내 문구를 복사한 뒤 뜨는 알림','안내 문구를 복사했습니다.');
  add('owner.unlinked.title',S,'계정 없는 근무명부 표 제목 — {n}은 인원 수','계정 없는 근무명부 ({n}명)',['n']);
  add('owner.approval.title',S,'가입 승인 대기 표 제목 — {n}은 인원 수','🆕 가입 승인 대기 ({n}명)',['n']);
  add('owner.members.title',S,'「직원 권한 관리」 묶음 제목','직원 권한 관리');
  add('owner.members.sub',S,'「직원 권한 관리」 제목 옆 작은 글','(입퇴사·승진 시 여기서 변경)');
  add('owner.confid.title',S,'케이스노트 접근 명단 제목','🔒 케이스노트 접근 명단');
  add('owner.tabs.title',S,'탭 노출 설정 제목','🧭 탭 노출 설정');
  add('owner.tabs.sub',S,'탭 노출 설정 제목 옆 작은 글','(역할별 · 즉시 반영)');
  add('owner.override.title',S,'사람별 탭 예외 제목','👤 사람별 탭 예외');
  add('owner.override.sub',S,'사람별 탭 예외 제목 옆 작은 글','(역할 기본을 개인별로 덮어씀 · 즉시 반영)');
  add('owner.next.title',S,'맨 아래 「다음 설계 예정」 카드 제목','다음 설계 예정/혹은 할일');
  add('owner.next.sub',S,'맨 아래 카드 제목 옆 작은 글','(설계 완료·구현 예정)');
  add('owner.next.body',S,'맨 아래 카드 본문(줄바꿈 그대로 보임)',HUB_NEXT_BODY_DEFAULT);
  HUB_TEXT_DEFS_CACHE=defs;
  return defs;
}
function hubTextDefByKey(key){
  const defs=hubTextDefs();
  for(let i=0;i<defs.length;i++)if(defs[i].key===key)return defs[i];
  return null;
}
// 검색칸: 키·어디에 보이는지·기본 글·지금 글 어디에든 들어 있으면 보인다(대소문자 무시, 띄어쓰기로 나눈 낱말을 모두 포함).
function hubTextMatches(def,query,current){
  const q=String(query==null?'':query).trim().toLowerCase();
  if(!q)return true;
  const hay=(def.key+' '+def.screen+' '+def.where+' '+def.def+' '+(current==null?'':current)).toLowerCase();
  return q.split(/\s+/).every(function(w){return hay.indexOf(w)>=0;});
}

/* 숫자 기준(app_settings 키) — 지금은 SQL로만 고치던 근태 기준 7개 */
const HUB_SETTING_DEFS=[
  {key:'late_cut',screen:'🕘 근태 기준',label:'지각 판정 시각',where:'출퇴근 — 이 시각을 넘겨 출근하면 지각으로 계산(예 09:40이면 09:41부터 지각)',def:'09:40',kind:'time'},
  {key:'siueop',screen:'🕘 근태 기준',label:'시업(공식 출근) 시각',where:'출퇴근 — 화면에 보여 주는 공식 출근 시각',def:'10:00',kind:'time'},
  {key:'jongeop_weekday_evening',screen:'🕘 근태 기준',label:'평일 야간조 종업 시각',where:'출퇴근 — 월~금 야간조의 종업 시각(연장근무 계산 기준)',def:'20:00',kind:'time'},
  {key:'jongeop_weekday_day',screen:'🕘 근태 기준',label:'평일 비야간 종업 시각',where:'출퇴근 — 월~금 야간조가 아닌 사람의 종업 시각',def:'18:30',kind:'time'},
  {key:'jongeop_sat',screen:'🕘 근태 기준',label:'토요일 종업 시각',where:'출퇴근 — 토요일 종업 시각',def:'17:00',kind:'time'},
  {key:'jongeop_sun',screen:'🕘 근태 기준',label:'일요일 종업 시각',where:'출퇴근 — 일요일 종업 시각',def:'14:00',kind:'time'},
  {key:'ot_unit_min',screen:'🕘 근태 기준',label:'연장근로 인정 단위(분)',where:'출퇴근 — 이 단위로 버림(예 10이면 9분→0분, 11분→10분)',def:'10',kind:'int',min:1,max:60,unit:'분'}
];
function hubSettingDefByKey(key){
  for(let i=0;i<HUB_SETTING_DEFS.length;i++)if(HUB_SETTING_DEFS[i].key===key)return HUB_SETTING_DEFS[i];
  return null;
}
// 값 검사: 화면에서 막고, 읽을 때는 모양이 틀리면 기본값을 쓴다. 통과하면 {ok:true,value}, 아니면 {ok:false,reason}.
function hubSettingValidate(def,raw){
  const v=String(raw==null?'':raw).trim();
  if(def.kind==='time'){
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))return {ok:false,reason:'시각은 09:40 처럼 시:분(24시간)으로 적어 주세요.'};
    return {ok:true,value:v};
  }
  if(def.kind==='int'){
    if(!/^\d{1,4}$/.test(v))return {ok:false,reason:'숫자만 적어 주세요.'};
    const n=Number(v);
    if(n<def.min||n>def.max)return {ok:false,reason:def.min+'부터 '+def.max+'까지만 쓸 수 있어요.'};
    return {ok:true,value:String(n)};
  }
  return v?{ok:true,value:v}:{ok:false,reason:'비워 둘 수 없어요.'};
}

/* 목록(app_settings 키) — 코드 고정 · 이름만 수정. addable=새 항목 추가 허용(흐름이 걸리지 않은 안전한 목록만). */
const HUB_LIST_DEFS=[
  {key:'list.profile_depts',screen:'🛡️ 계정·권한 관리',label:'직원 부서',addable:true,
   where:'계정·권한 관리 › 직원 권한 관리 표의 「부서」 고르는 칸',
   note:'「데스크」는 입금 열람 권한이 이 코드로 확인하므로 코드(왼쪽 회색)는 못 바꾸고 보이는 이름만 고칠 수 있어요. 새 부서는 ＋ 추가로 늘려요.',
   def:[{code:'진료실',label:'진료실'},{code:'데스크',label:'데스크'},{code:'기공팀',label:'기공팀'},{code:'기타',label:'기타'}]}
];
function hubListDefByKey(key){
  for(let i=0;i<HUB_LIST_DEFS.length;i++)if(HUB_LIST_DEFS[i].key===key)return HUB_LIST_DEFS[i];
  return null;
}
// 목록 저장 전 검사: 기본 코드는 모두 있어야 하고(코드 고정), 새 항목은 addable일 때만, 이름은 1~20자·중복 없음.
function hubListValidate(def,items){
  if(!Array.isArray(items)||!items.length)return {ok:false,reason:'목록이 비어 있어요.'};
  const defCodes={};def.def.forEach(function(d){defCodes[d.code]=true;});
  const seenCode={},seenLabel={},out=[];
  for(let i=0;i<items.length;i++){
    const code=String(items[i]&&items[i].code==null?'':items[i].code).trim(),label=String(items[i]&&items[i].label==null?'':items[i].label).trim();
    if(!code)return {ok:false,reason:'코드가 빈 항목이 있어요.'};
    if(!label)return {ok:false,reason:'이름이 빈 항목이 있어요.'};
    if(label.length>20)return {ok:false,reason:'이름은 20자 이하로 적어 주세요.'};
    if(/[<>"'&\\\u0000-\u001f]/.test(code+label))return {ok:false,reason:'이름에 쓸 수 없는 글자(< > " \' & \\)가 있어요.'};
    if(seenCode[code])return {ok:false,reason:'같은 코드가 두 번 들어 있어요.'};
    if(seenLabel[label])return {ok:false,reason:'같은 이름이 두 번 들어 있어요: '+label};
    if(!defCodes[code]&&!def.addable)return {ok:false,reason:'이 목록은 새 항목을 늘릴 수 없어요.'};
    seenCode[code]=true;seenLabel[label]=true;out.push({code:code,label:label});
  }
  for(const c in defCodes)if(!seenCode[c])return {ok:false,reason:'기본 항목은 지울 수 없어요: '+c};
  return {ok:true,value:JSON.stringify(out),items:out};
}

/* ── 표 읽기·쓰기(sb = supabase 클라이언트) ── */
async function hubTextsFetch(sb){
  if(!sb||typeof sb.from!=='function')throw new Error('연결 정보가 없습니다.');
  const res=await sb.from('hub_ui_texts').select('key,value');
  if(res.error)throw res.error;
  return res.data||[];
}
// 허브를 열 때 한 번: 있는 키는 덮어쓰고, 읽기에 실패하면 덮어쓰기 없이 기본값으로 조용히 쓴다.
async function hubTextsLoadInto(sb){
  try{hubTextSetOverrides(await hubTextsFetch(sb));return true;}
  catch(e){hubTextSetOverrides([]);return false;}
}
function hubTextNorm(v){return String(v==null?'':v).replace(/\r\n/g,'\n').trim();}
// 저장 1건. 빈 글이거나 기본 글과 같으면 행을 지워 기본으로 돌리고, 다르면 저장한다. 결과 {ok,action:'saved'|'reset'} 또는 {ok:false,reason,error}.
async function hubTextsSave(sb,key,value){
  const def=hubTextDefByKey(key);
  if(!def)return {ok:false,reason:'unknown_key',error:null};
  const v=String(value==null?'':value).replace(/\r\n/g,'\n');
  if(v.length>HUB_TEXT_MAX)return {ok:false,reason:'too_long',error:null};
  const same=v.trim()===''||hubTextNorm(v)===hubTextNorm(def.def);
  try{
    if(same){
      const r=await sb.from('hub_ui_texts').delete().eq('key',key);
      if(r&&r.error)throw r.error;
      hubTextDropOverride(key);
      return {ok:true,action:'reset'};
    }
    const r=await sb.from('hub_ui_texts').upsert({key:key,value:v},{onConflict:'key'});
    if(r&&r.error)throw r.error;
    hubTextPutOverride(key,v);
    return {ok:true,action:'saved'};
  }catch(e){return {ok:false,reason:'write_failed',error:e};}
}
async function hubTextsReset(sb,key){
  if(!hubTextDefByKey(key))return {ok:false,reason:'unknown_key',error:null};
  try{
    const r=await sb.from('hub_ui_texts').delete().eq('key',key);
    if(r&&r.error)throw r.error;
    hubTextDropOverride(key);
    return {ok:true,action:'reset'};
  }catch(e){return {ok:false,reason:'write_failed',error:e};}
}
// app_settings 한 줄 쓰기(원장만 통과 — DB 정책). 성공하면 메모리(=호스트 SETTINGS)에도 바로 넣는다.
async function hubSettingWrite(sb,key,value){
  try{
    const r=await sb.from('app_settings').upsert({key:key,value:value},{onConflict:'key'});
    if(r&&r.error)throw r.error;
    HUB_SETTING_VALUES[key]=value;
    return {ok:true};
  }catch(e){return {ok:false,reason:'write_failed',error:e};}
}
async function hubSettingSave(sb,key,raw){
  const def=hubSettingDefByKey(key);
  if(!def)return {ok:false,reason:'unknown_key',error:null};
  const chk=hubSettingValidate(def,raw);
  if(!chk.ok)return {ok:false,reason:'invalid',error:null,message:chk.reason};
  const w=await hubSettingWrite(sb,key,chk.value);
  return w.ok?{ok:true,action:'saved',value:chk.value}:w;
}
// app_settings는 지울 수 없으므로(정책: 읽기·넣기·고치기만) 기본값을 다시 적는다.
async function hubSettingReset(sb,key){
  const def=hubSettingDefByKey(key);
  if(!def)return {ok:false,reason:'unknown_key',error:null};
  const w=await hubSettingWrite(sb,key,def.def);
  return w.ok?{ok:true,action:'reset',value:def.def}:w;
}
async function hubListSave(sb,key,items){
  const def=hubListDefByKey(key);
  if(!def)return {ok:false,reason:'unknown_key',error:null};
  const chk=hubListValidate(def,items);
  if(!chk.ok)return {ok:false,reason:'invalid',error:null,message:chk.reason};
  const w=await hubSettingWrite(sb,key,chk.value);
  return w.ok?{ok:true,action:'saved',items:chk.items}:w;
}
async function hubListReset(sb,key){
  const def=hubListDefByKey(key);
  if(!def)return {ok:false,reason:'unknown_key',error:null};
  const w=await hubSettingWrite(sb,key,JSON.stringify(def.def));
  return w.ok?{ok:true,action:'reset',items:def.def.map(function(d){return {code:d.code,label:d.label};})}:w;
}
// 쓰기 실패를 직원이 알아듣게(권한 없음 등)
function hubWriteErrorMessage(what,error){
  const code=error&&error.code,msg=(error&&error.message)||'';
  if(code==='42501'||/row-level security|permission denied/i.test(msg))return what+'하지 못했어요 — 원장 계정으로 로그인했는지 확인해 주세요.';
  return what+'하지 못했어요'+(msg?': '+msg:'.');
}
/* hub-texts:test-end */

/* ── 화면: 「⚙️ 허브 설정」 탭(원장 전용) — 📝 글 고치기 · 🔢 숫자·기준 · 📋 목록 ── */
let HUB_SB=null,HUB_ME={},HUB_ROOT=null,HUB_SUBTAB='texts',HUB_STYLE_INJECTED=false,HUB_LIST_DRAFT={};

function hubEnsureStyle(){
  if(HUB_STYLE_INJECTED||typeof document==='undefined')return;
  HUB_STYLE_INJECTED=true;
  const css=
    '.hub-subnav{margin-bottom:10px}'+
    '.hub-subnav .mini.on{background:var(--mint-dk);border-color:var(--mint);color:var(--mint)}'+
    '.hub-grp{border:1px solid var(--line);border-radius:10px;margin:8px 0;padding:8px 10px}'+
    '.hub-grp>summary{font-weight:700;cursor:pointer;font-size:14px}'+
    '.hub-row{border-top:1px solid var(--line);margin-top:10px;padding-top:10px}'+
    '.hub-where{font-size:13px;line-height:1.5}'+
    '.hub-def{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.55;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px;margin:4px 0;font-family:inherit;max-width:100%}'+
    '.hub-row textarea{width:100%;box-sizing:border-box;min-height:48px;font-size:13px;line-height:1.55}'+
    '.hub-search{width:100%;box-sizing:border-box;margin:6px 0 4px}'+
    '.hub-code{display:inline-block;min-width:84px;padding:4px 8px;border-radius:8px;background:var(--bg);border:1px solid var(--line);color:var(--gray);font-size:12.5px}'+
    '.hub-list-row{display:flex;gap:8px;align-items:center;margin:6px 0;flex-wrap:wrap}'+
    '.hub-list-row input{flex:1;min-width:120px}';
  const style=document.createElement('style');
  style.id='hub-texts-style';
  style.textContent=css;
  document.head.appendChild(style);
}
function hubBadge(isEdited){return isEdited?'<span class="b ok">고침</span>':'';}
function hubRowsFor(def){return Math.min(14,Math.max(2,String(def.def).split('\n').length+1));}

async function hubSettingsRefresh(sb){
  // 설정 표를 다시 읽어 메모리(=호스트 SETTINGS)에 합친다. 실패하면 던진다.
  const res=await sb.from('app_settings').select('key,value');
  if(res.error)throw res.error;
  (res.data||[]).forEach(function(r){if(r&&typeof r.key==='string'&&typeof r.value==='string')HUB_SETTING_VALUES[r.key]=r.value;});
}

function hubShellHtml(){
  const tabs=[{key:'texts',label:'📝 글 고치기'},{key:'settings',label:'🔢 숫자·기준'},{key:'lists',label:'📋 목록'}];
  const nav='<div class="rowflex hub-subnav">'+tabs.map(function(t){return '<button class="mini'+(HUB_SUBTAB===t.key?' on':'')+'" data-hub-subtab="'+t.key+'">'+t.label+'</button>';}).join('')+'</div>';
  return '<div class="card"><h2>'+hubEsc(hubText('tab.hubset','⚙️ 허브 설정'))+'</h2>'+
    '<div class="sub">직원 화면에 뜨는 글·숫자 기준·목록을 여기서 직접 고쳐요(원장만 보이는 화면). 고치고 「저장」을 누르면 직원이 허브를 다음에 열 때부터 바뀐 값이 보여요. 「기본으로 되돌리기」를 누르면 처음 값으로 돌아가요. 🤖 AI 도우미 안내 문구는 「🤖 AI 도우미」 탭의 「📝 안내 문구」에서 고쳐요.</div>'+
    nav+'<div id="hubSection"></div></div>';
}

async function renderHubSettings(m,ctx){
  HUB_SB=(ctx&&ctx.sb)||null;
  HUB_ME=(ctx&&ctx.me)||{};
  HUB_ROOT=m;
  if(!m)return;
  // 원장이 아니면 아무것도 그리지 않는다(탭도 숨기지만 한 번 더 막는다). DB도 쓰기는 원장만 허용한다.
  if(HUB_ME.role!=='owner'){m.innerHTML='<div class="card"><div class="empty">원장만 볼 수 있는 화면입니다.</div></div>';return;}
  hubEnsureStyle();
  m.innerHTML=hubShellHtml();
  Array.prototype.forEach.call(m.querySelectorAll('[data-hub-subtab]'),function(btn){
    btn.addEventListener('click',function(){HUB_SUBTAB=btn.getAttribute('data-hub-subtab');return renderHubSettings(HUB_ROOT,{sb:HUB_SB,me:HUB_ME});});
  });
  const sec=m.querySelector('#hubSection');
  if(!sec)return;
  if(HUB_SUBTAB==='settings')await hubRenderSettingsSection(sec);
  else if(HUB_SUBTAB==='lists')await hubRenderListsSection(sec);
  else await hubRenderTextsSection(sec);
}

/* ── 📝 글 고치기 ── */
async function hubRenderTextsSection(sec){
  sec.innerHTML='<div class="empty">불러오는 중…</div>';
  try{hubTextSetOverrides(await hubTextsFetch(HUB_SB));} // 탭을 열 때마다 최신 값으로
  catch(e){sec.innerHTML='<div class="empty">불러오지 못했습니다: '+hubEsc((e&&e.message)||'')+' · 표(hub_ui_texts)가 아직 없으면 원장이 SQL을 먼저 적용해야 해요.</div>';return;}
  hubDrawTextsSection(sec);
}
function hubDrawTextsSection(sec){
  const defs=hubTextDefs(),groups=[];
  defs.forEach(function(d,i){
    let g=groups.find(function(x){return x.name===d.screen;});
    if(!g){g={name:d.screen,items:[]};groups.push(g);}
    g.items.push({d:d,i:i});
  });
  sec.innerHTML='<div class="sub">화면별로 접어 두었어요. 찾는 글이 있으면 아래 검색칸에 낱말을 쳐 보세요(탭 이름·「가입 안내」·「승인」 등).</div>'+
    '<input id="hubTxtSearch" class="hub-search" type="search" placeholder="검색 — 키·화면 위치·글 어디든" autocomplete="off">'+
    '<div id="hubTxtList">'+groups.map(function(g){
      const edited=g.items.filter(function(x){return hubTextOverride(x.d.key)!=null;}).length;
      return '<details class="hub-grp" data-hub-group="'+hubEsc(g.name)+'"><summary>'+hubEsc(g.name)+' <span class="sub">('+g.items.length+'개'+(edited?' · 고친 것 '+edited+'개':'')+')</span></summary>'+
        g.items.map(function(x){
          const d=x.d,i=x.i,cur=hubText(d.key,d.def);
          return '<div class="hub-row" data-hub-text-row="'+i+'">'+
            '<div class="hub-where"><b>'+hubEsc(d.where)+'</b> <span id="hubTxtBadge_'+i+'">'+hubBadge(hubTextOverride(d.key)!=null)+'</span></div>'+
            '<div class="sub">이름표: '+hubEsc(d.key)+(d.vars?' · 글 안의 '+d.vars.map(function(v){return '{'+v+'}';}).join(' ')+'은 화면이 채워 넣는 자리라 지우지 마세요':'')+'</div>'+
            '<div class="sub">기본 글</div><pre class="hub-def">'+hubEsc(d.def)+'</pre>'+
            '<label class="sub" for="hubTxtIn_'+i+'">지금 글 (여기서 고쳐요)</label>'+
            '<textarea id="hubTxtIn_'+i+'" rows="'+hubRowsFor(d)+'">'+hubEsc(cur)+'</textarea>'+
            '<div class="rowflex"><button class="mini stamp" data-hub-text-save="'+i+'">저장</button><button class="mini" data-hub-text-reset="'+i+'">기본으로 되돌리기</button><span class="hint" id="hubTxtMsg_'+i+'"></span></div>'+
            '</div>';
        }).join('')+'</details>';
    }).join('')+'</div>';
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-text-save]'),function(b){b.addEventListener('click',function(){return hubSaveTextRow(sec,Number(b.getAttribute('data-hub-text-save')));});});
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-text-reset]'),function(b){b.addEventListener('click',function(){return hubResetTextRow(sec,Number(b.getAttribute('data-hub-text-reset')));});});
  const box=sec.querySelector('#hubTxtSearch');
  if(box)box.addEventListener('input',function(){hubApplyTextFilter(sec,box.value);});
}
// 검색: 맞는 줄만 보이고, 맞는 줄이 없는 화면 묶음은 숨기며, 검색어가 있으면 묶음을 펼친다(진짜 화면에서만 동작).
function hubApplyTextFilter(sec,query){
  const defs=hubTextDefs(),q=String(query||'').trim();
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-group]'),function(g){
    let shown=0;
    Array.prototype.forEach.call(g.querySelectorAll('[data-hub-text-row]'),function(row){
      const d=defs[Number(row.getAttribute('data-hub-text-row'))];
      const ok=!!d&&hubTextMatches(d,q,hubText(d.key,d.def));
      row.hidden=!ok;if(ok)shown++;
    });
    g.hidden=shown===0;
    if(q)g.open=shown>0;
  });
}
function hubAfterTextWrite(sec,i,r,okMsg){
  const d=hubTextDefs()[i];
  const msg=sec.querySelector('#hubTxtMsg_'+i),inp=sec.querySelector('#hubTxtIn_'+i),badge=sec.querySelector('#hubTxtBadge_'+i);
  if(!r.ok){
    if(msg)msg.textContent=r.reason==='too_long'?'저장하지 못했어요 — 20,000자 이하로 적어 주세요.':hubWriteErrorMessage('저장',r.error);
    return;
  }
  if(inp)inp.value=hubText(d.key,d.def); // 저장이면 저장한 글, 되돌리기면 기본 글
  if(badge)badge.innerHTML=hubBadge(hubTextOverride(d.key)!=null);
  if(msg)msg.textContent=okMsg||(r.action==='reset'?'기본 글로 돌렸어요.':'저장했어요.');
  // 탭·메뉴 이름을 고쳤으면 위쪽 메뉴를 바로 다시 그린다. 그 밖의 글은 그 화면을 다음에 열 때 바뀐다.
  if(/^(tab|menu)\./.test(d.key)&&typeof root.renderNav==='function'){try{root.renderNav();}catch(e){}}
}
async function hubSaveTextRow(sec,i){
  const d=hubTextDefs()[i],inp=sec.querySelector('#hubTxtIn_'+i);
  if(!d||!inp)return;
  const r=await hubTextsSave(HUB_SB,d.key,inp.value);
  hubAfterTextWrite(sec,i,r,r.ok&&r.action==='reset'?'기본 글과 같거나 비어 있어서 기본 글로 돌렸어요.':'');
}
async function hubResetTextRow(sec,i){
  const d=hubTextDefs()[i];
  if(!d)return;
  const r=await hubTextsReset(HUB_SB,d.key);
  hubAfterTextWrite(sec,i,r,'');
}

/* ── 🔢 숫자·기준 ── */
async function hubRenderSettingsSection(sec){
  sec.innerHTML='<div class="empty">불러오는 중…</div>';
  try{await hubSettingsRefresh(HUB_SB);}
  catch(e){sec.innerHTML='<div class="empty">불러오지 못했습니다: '+hubEsc((e&&e.message)||'')+'</div>';return;}
  hubDrawSettingsSection(sec);
}
function hubDrawSettingsSection(sec){
  const groups=[];
  HUB_SETTING_DEFS.forEach(function(d,i){
    let g=groups.find(function(x){return x.name===d.screen;});
    if(!g){g={name:d.screen,items:[]};groups.push(g);}
    g.items.push({d:d,i:i});
  });
  sec.innerHTML='<div class="sub">출퇴근 계산이 쓰는 기준이에요. 지금까지는 SQL로만 고쳤는데 여기서 바로 고쳐요. 저장하면 출퇴근 화면이 다음에 열릴 때부터 새 기준으로 계산해요(이미 저장된 지난 기록은 안 바뀌어요).</div>'+
    groups.map(function(g){
      return '<details class="hub-grp" open><summary>'+hubEsc(g.name)+' <span class="sub">('+g.items.length+'개)</span></summary>'+
        g.items.map(function(x){
          const d=x.d,i=x.i,cur=hubSetting(d.key,d.def);
          const input=d.kind==='time'
            ?'<input id="hubSetIn_'+i+'" type="time" value="'+hubEsc(cur)+'">'
            :'<input id="hubSetIn_'+i+'" type="number" inputmode="numeric" min="'+d.min+'" max="'+d.max+'" value="'+hubEsc(cur)+'"> '+hubEsc(d.unit||'');
          return '<div class="hub-row" data-hub-set-row="'+i+'">'+
            '<div class="hub-where"><b>'+hubEsc(d.label)+'</b> <span id="hubSetBadge_'+i+'">'+hubBadge(cur!==d.def)+'</span></div>'+
            '<div class="sub">'+hubEsc(d.where)+' · 이름표: '+hubEsc(d.key)+'</div>'+
            '<div class="sub">처음 값 '+hubEsc(d.def)+(d.kind==='int'?' · '+d.min+'~'+d.max+' 사이':'')+'</div>'+
            '<div class="rowflex">'+input+'<button class="mini stamp" data-hub-set-save="'+i+'">저장</button><button class="mini" data-hub-set-reset="'+i+'">기본으로 되돌리기</button><span class="hint" id="hubSetMsg_'+i+'"></span></div>'+
            '</div>';
        }).join('')+'</details>';
    }).join('');
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-set-save]'),function(b){b.addEventListener('click',function(){return hubSaveSettingRow(sec,Number(b.getAttribute('data-hub-set-save')));});});
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-set-reset]'),function(b){b.addEventListener('click',function(){return hubResetSettingRow(sec,Number(b.getAttribute('data-hub-set-reset')));});});
}
function hubAfterSettingWrite(sec,i,r){
  const d=HUB_SETTING_DEFS[i];
  const msg=sec.querySelector('#hubSetMsg_'+i),inp=sec.querySelector('#hubSetIn_'+i),badge=sec.querySelector('#hubSetBadge_'+i);
  if(!r.ok){
    if(msg)msg.textContent=r.reason==='invalid'?('저장하지 못했어요 — '+r.message):hubWriteErrorMessage('저장',r.error);
    return;
  }
  const cur=hubSetting(d.key,d.def);
  if(inp)inp.value=cur;
  if(badge)badge.innerHTML=hubBadge(cur!==d.def);
  if(msg)msg.textContent=r.action==='reset'?'처음 값으로 돌렸어요.':'저장했어요.';
}
async function hubSaveSettingRow(sec,i){
  const d=HUB_SETTING_DEFS[i],inp=sec.querySelector('#hubSetIn_'+i);
  if(!d||!inp)return;
  hubAfterSettingWrite(sec,i,await hubSettingSave(HUB_SB,d.key,inp.value));
}
async function hubResetSettingRow(sec,i){
  const d=HUB_SETTING_DEFS[i];
  if(!d)return;
  hubAfterSettingWrite(sec,i,await hubSettingReset(HUB_SB,d.key));
}

/* ── 📋 목록 ── */
async function hubRenderListsSection(sec){
  sec.innerHTML='<div class="empty">불러오는 중…</div>';
  try{await hubSettingsRefresh(HUB_SB);}
  catch(e){sec.innerHTML='<div class="empty">불러오지 못했습니다: '+hubEsc((e&&e.message)||'')+'</div>';return;}
  HUB_LIST_DRAFT={};
  hubDrawListsSection(sec);
}
function hubListItemsFor(def){return HUB_LIST_DRAFT[def.key]||hubList(def.key,def.def);}
function hubDrawListsSection(sec){
  sec.innerHTML='<div class="sub">선택지에 나오는 이름이에요. 왼쪽 회색 글은 화면 뒤에서 쓰는 이름표(코드)라 못 바꾸고, 오른쪽 이름만 고칠 수 있어요. 새 항목을 늘려도 되는 목록에만 「＋ 추가」가 있어요.</div>'+
    HUB_LIST_DEFS.map(function(def,di){
      const items=hubListItemsFor(def),defCodes={};def.def.forEach(function(d){defCodes[d.code]=true;});
      const edited=JSON.stringify(hubList(def.key,def.def))!==JSON.stringify(def.def); // 저장된 값 기준(아직 저장 안 한 초안은 표시 안 함)
      return '<details class="hub-grp" open><summary>'+hubEsc(def.screen)+' › '+hubEsc(def.label)+' <span class="sub">('+items.length+'개)</span></summary>'+
        '<div class="hub-where"><b>'+hubEsc(def.where)+'</b> <span id="hubLstBadge_'+di+'">'+hubBadge(edited)+'</span></div>'+
        '<div class="sub">이름표: '+hubEsc(def.key)+'</div>'+
        (def.note?'<div class="sub">'+hubEsc(def.note)+'</div>':'')+
        items.map(function(it,ri){
          return '<div class="hub-list-row"><span class="hub-code">'+hubEsc(it.code)+'</span>'+
            '<input id="hubLstLbl_'+di+'_'+ri+'" type="text" maxlength="20" value="'+hubEsc(it.label)+'" aria-label="'+hubEsc(it.code)+' 보이는 이름">'+
            (defCodes[it.code]?'':'<button class="mini rej" data-hub-list-del="'+di+':'+ri+'">빼기</button>')+'</div>';
        }).join('')+
        (def.addable?'<div class="hub-list-row"><input id="hubLstNew_'+di+'" type="text" maxlength="20" placeholder="새 항목 이름" aria-label="새 항목 이름"><button class="mini" data-hub-list-add="'+di+'">＋ 추가</button></div>':'')+
        '<div class="rowflex"><button class="mini stamp" data-hub-list-save="'+di+'">저장</button><button class="mini" data-hub-list-reset="'+di+'">기본으로 되돌리기</button><span class="hint" id="hubLstMsg_'+di+'"></span></div>'+
        '</details>';
    }).join('');
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-list-save]'),function(b){b.addEventListener('click',function(){return hubSaveList(sec,Number(b.getAttribute('data-hub-list-save')));});});
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-list-reset]'),function(b){b.addEventListener('click',function(){return hubResetList(sec,Number(b.getAttribute('data-hub-list-reset')));});});
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-list-add]'),function(b){b.addEventListener('click',function(){return hubAddListItem(sec,Number(b.getAttribute('data-hub-list-add')));});});
  Array.prototype.forEach.call(sec.querySelectorAll('[data-hub-list-del]'),function(b){b.addEventListener('click',function(){const p=String(b.getAttribute('data-hub-list-del')).split(':');return hubDelListItem(sec,Number(p[0]),Number(p[1]));});});
}
// 화면에 적힌 이름들을 초안(draft)에 모은다.
function hubCollectListDraft(sec,di){
  const def=HUB_LIST_DEFS[di],items=hubListItemsFor(def);
  const next=items.map(function(it,ri){const el=sec.querySelector('#hubLstLbl_'+di+'_'+ri);return {code:it.code,label:el&&typeof el.value==='string'?el.value:it.label};});
  HUB_LIST_DRAFT[def.key]=next;
  return next;
}
function hubAddListItem(sec,di){
  const def=HUB_LIST_DEFS[di],box=sec.querySelector('#hubLstNew_'+di),name=String(box&&box.value||'').trim();
  const draft=hubCollectListDraft(sec,di);
  if(!def.addable)return;
  if(!name){const m=sec.querySelector('#hubLstMsg_'+di);if(m)m.textContent='추가할 이름을 적어 주세요.';return;}
  const next=draft.concat([{code:name,label:name}]);
  const chk=hubListValidate(def,next);
  if(!chk.ok){const m=sec.querySelector('#hubLstMsg_'+di);if(m)m.textContent=chk.reason;return;}
  HUB_LIST_DRAFT[def.key]=next;
  hubDrawListsSection(sec);
  const m2=sec.querySelector('#hubLstMsg_'+di);if(m2)m2.textContent='목록에 넣었어요. 「저장」을 눌러야 직원 화면에 반영돼요.';
}
function hubDelListItem(sec,di,ri){
  const def=HUB_LIST_DEFS[di],draft=hubCollectListDraft(sec,di),defCodes={};def.def.forEach(function(d){defCodes[d.code]=true;});
  if(!draft[ri]||defCodes[draft[ri].code])return; // 기본 항목은 뺄 수 없다
  HUB_LIST_DRAFT[def.key]=draft.filter(function(_,i){return i!==ri;});
  hubDrawListsSection(sec);
  const m=sec.querySelector('#hubLstMsg_'+di);if(m)m.textContent='목록에서 뺐어요. 「저장」을 눌러야 직원 화면에 반영돼요.';
}
async function hubSaveList(sec,di){
  const def=HUB_LIST_DEFS[di];
  const draft=hubCollectListDraft(sec,di);
  const r=await hubListSave(HUB_SB,def.key,draft);
  const msg=sec.querySelector('#hubLstMsg_'+di);
  if(!r.ok){if(msg)msg.textContent=r.reason==='invalid'?('저장하지 못했어요 — '+r.message):hubWriteErrorMessage('저장',r.error);return;}
  delete HUB_LIST_DRAFT[def.key];
  hubDrawListsSection(sec);
  const m2=sec.querySelector('#hubLstMsg_'+di);if(m2)m2.textContent='저장했어요.';
}
async function hubResetList(sec,di){
  const def=HUB_LIST_DEFS[di];
  const r=await hubListReset(HUB_SB,def.key);
  const msg=sec.querySelector('#hubLstMsg_'+di);
  if(!r.ok){if(msg)msg.textContent=hubWriteErrorMessage('되돌리',r.error);return;}
  delete HUB_LIST_DRAFT[def.key];
  hubDrawListsSection(sec);
  const m2=sec.querySelector('#hubLstMsg_'+di);if(m2)m2.textContent='처음 목록으로 돌렸어요.';
}

/* ── 호스트(hr.html)가 쓰는 입구 ── */
const HubUi={
  // 허브를 열 때 한 번: 글 표를 읽어 메모리에 둔다(실패하면 기본값만 씀). 숫자·목록은 호스트 SETTINGS를 그대로 쓴다.
  load:function(sb){return hubTextsLoadInto(sb);},
  setSettings:hubSettingSetValues,
  renderSettings:renderHubSettings,
  applyTextFilter:hubApplyTextFilter, // 검색칸 동작(시험용으로도 공개)
  helpers:{hubText:hubText,hubSetting:hubSetting,hubList:hubList}
};
root.hubText=hubText;
root.hubTextHtml=hubTextHtml;
root.hubSetting=hubSetting;
root.hubSettingNumber=hubSettingNumber;
root.hubList=hubList;
root.HubUi=HubUi;
})(typeof window!=='undefined'?window:globalThis);

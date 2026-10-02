// 직원허브 시간 표시 통일(원장 2026-10-02 노션) 시험 — 「2026.9.9 오전 9시 30분」 · 시각만 「오후 3시 31분」 · 정각 「오후 3시」, 원장 보기판 안 「KST」 없앰.
// ①공통 함수(hubTimeParts·hubFmtDate·hubFmtTime·hubFmtDateTime·hubFmtWhen) ②꼴 글은 ⚙️ 허브 설정 time.* 키(바꾸면 꼴이 바뀜) ③md ④원장 보기판 ownerBoardHumanizeTimes
// ⑤컴퓨터 시간대와 상관없이 같은 결과 ⑥화면 호출부 연결(정적 확인) ⑦hub-texts.js 기본 글 = hr.html 기본 글
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const hr=read('hr.html'),js=read('hub-texts.js'),ai=read('ai-assistants.js');
const timeBlock=hr.match(/\/\* hub-time:test-start \*\/[\s\S]*?\/\* hub-time:test-end \*\//)?.[0];
const textsBlock=js.match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)?.[0];
const clone=x=>JSON.parse(JSON.stringify(x));
// 시간 함수만(허브 설정 엔진 없음 → 기본 글)
function plain(){const c={};vm.createContext(c);vm.runInContext(timeBlock+';this.t={hubTimeParts,hubFmtDate,hubFmtTime,hubFmtDateTime,hubFmtWhen,ownerBoardHumanizeTimes,ownerBoardHumanizeText};',c);return {c,t:c.t};}
// 허브 설정 엔진과 함께(원장이 time.* 글을 고친 상황)
function withEngine(rows){
  const c={};vm.createContext(c);
  vm.runInContext(textsBlock+'\nfunction hubT(k,d,v){return hubText(k,d,v);}\n'+timeBlock+';this.t={hubFmtDate,hubFmtTime,hubFmtDateTime,hubFmtWhen,ownerBoardHumanizeTimes,hubTextSetOverrides,hubTextDefs};',c);
  c.t.hubTextSetOverrides(rows||[]);return c;
}
const NOW='2026-10-02T03:00:00Z'; // 한국 2026-10-02 12:00

test('공통 함수 블록과 hub-texts.js 시험 구간이 있다',()=>{assert.ok(timeBlock,'hub-time 구간');assert.ok(textsBlock,'hub-texts 구간');});

test('ⓐ 시각만(hubFmtTime): 오전·오후 · 0시=오전 12시 · 12시=오후 12시 · 정각은 분 없이 · 분 한 자리는 0 없이',()=>{
  const {t}=plain();
  const cases={'09:30':'오전 9시 30분','15:31':'오후 3시 31분','15:00':'오후 3시','00:00':'오전 12시','00:05':'오전 12시 5분','12:00':'오후 12시','12:30':'오후 12시 30분','23:59':'오후 11시 59분','09:30:15':'오전 9시 30분','9:05':'오전 9시 5분','10:00:00':'오전 10시'};
  for(const [k,v] of Object.entries(cases))assert.equal(t.hubFmtTime(k),v,k);
  // 하루 분 수
  assert.equal(t.hubFmtTime(570),'오전 9시 30분');assert.equal(t.hubFmtTime(0),'오전 12시');assert.equal(t.hubFmtTime(15*60),'오후 3시');assert.equal(t.hubFmtTime(15*60+31),'오후 3시 31분');
  // 시각 값(ISO · Date)에서 시각만
  assert.equal(t.hubFmtTime('2026-10-01T15:30:00Z'),'오전 12시 30분');
  // 못 읽는 값 · 빈 값
  assert.equal(t.hubFmtTime('abc'),'abc');assert.equal(t.hubFmtTime('25:61'),'25:61');assert.equal(t.hubFmtTime(null),'');assert.equal(t.hubFmtTime(undefined),'');assert.equal(t.hubFmtTime(''),'');
  assert.equal(t.hubFmtTime('2026-10-02'),'2026-10-02','날짜만 있는 값은 시각이 없으니 원래 글자');
});

test('ⓑ UTC(Z·±HH:MM) 값은 한국 시각으로 — 날짜가 넘어가는 경우 포함',()=>{
  const {t}=plain();
  assert.equal(t.hubFmtDateTime('2026-10-01T15:30:00Z'),'2026.10.2 오전 12시 30분');
  assert.equal(t.hubFmtDateTime('2026-10-01T15:30:00.000Z'),'2026.10.2 오전 12시 30분');
  assert.equal(t.hubFmtDateTime('2026-09-09T00:30:00+00:00'),'2026.9.9 오전 9시 30분');
  assert.equal(t.hubFmtDateTime('2026-09-09T09:30:00+09:00'),'2026.9.9 오전 9시 30분');
  assert.equal(t.hubFmtDateTime('2026-09-08T20:30:00-05:00'),'2026.9.9 오전 10시 30분','서쪽 시간대(-05:00)');
  assert.equal(t.hubFmtDateTime('2026-09-09 00:30:00+00'),'2026.9.9 오전 9시 30분','Z 대신 +00');
  assert.equal(t.hubFmtDateTime('2026-12-31T15:00:00Z'),'2027.1.1 오전 12시','해가 넘어감 · 정각');
  assert.equal(t.hubFmtDateTime(new Date('2026-10-01T15:30:00Z')),'2026.10.2 오전 12시 30분','Date 값');
  assert.equal(t.hubFmtDateTime(Date.UTC(2026,9,1,15,30)),'2026.10.2 오전 12시 30분','밀리초 숫자');
  assert.equal(t.hubFmtDate('2026-10-01T15:30:00Z'),'2026.10.2');
});

test('ⓒ 시간대 표시가 없는 글자는 한국 시각 그대로 읽고, 날짜만 있으면 날짜만',()=>{
  const {t}=plain();
  assert.equal(t.hubFmtDateTime('2026-09-09 09:30'),'2026.9.9 오전 9시 30분');
  assert.equal(t.hubFmtDateTime('2026-09-09T09:30:00'),'2026.9.9 오전 9시 30분');
  assert.equal(t.hubFmtDateTime('2026-09-09 21:05'),'2026.9.9 오후 9시 5분');
  assert.equal(t.hubFmtDateTime('2026-09-09'),'2026.9.9');
  assert.equal(t.hubFmtDate('2026-09-09'),'2026.9.9');
  assert.equal(t.hubFmtDate('2026-09-09 09:30'),'2026.9.9');
  // 못 읽는 값은 원래 글자(빈 값은 빈 글자)
  for(const bad of ['g','2026-13-01 10:00','2026-02-30','2026-09-09 25:00','2026-09-09 10:61','어제'])assert.equal(t.hubFmtDateTime(bad),bad,bad);
  assert.equal(t.hubFmtDateTime(''),'');assert.equal(t.hubFmtDateTime(null),'');assert.equal(t.hubFmtDate(undefined),'');
  assert.equal(t.hubTimeParts('x'),null);
  assert.deepEqual(clone(t.hubTimeParts('2026-09-09 09:30')),{y:2026,m:9,d:9,h:9,mi:30});
  assert.deepEqual(clone(t.hubTimeParts('2026-09-09')),{y:2026,m:9,d:9,h:null,mi:null});
});

test('ⓓ hubFmtWhen: 한국 날짜로 오늘이면 시각만, 아니면 날짜+시각(목록·로그 줄용) · 지금은 HUB_NOW로 고정',()=>{
  const {c,t}=plain();
  c.HUB_NOW=()=>new Date(NOW);
  assert.equal(t.hubFmtWhen('2026-10-02T00:30:00Z'),'오전 9시 30분','오늘(한국 09:30)');
  assert.equal(t.hubFmtWhen('2026-10-01T15:00:00Z'),'오전 12시','한국 날짜로는 오늘 00:00');
  assert.equal(t.hubFmtWhen('2026-10-01T14:59:00Z'),'2026.10.1 오후 11시 59분','한국 날짜로는 어제 23:59');
  assert.equal(t.hubFmtWhen('2026-09-30T05:00:00Z'),'2026.9.30 오후 2시');
  assert.equal(t.hubFmtWhen('2026-10-02 18:45'),'오후 6시 45분','시간대 없는 글자 — 한국 오늘');
  assert.equal(t.hubFmtWhen('2026-10-02'),'2026.10.2','날짜만 있는 값은 날짜');
  assert.equal(t.hubFmtWhen('g'),'g');assert.equal(t.hubFmtWhen(null),'');
  // 지금을 바꾸면 결과가 바뀜(한국 날짜 기준)
  c.HUB_NOW=()=>new Date('2026-10-02T14:59:00Z');assert.equal(t.hubFmtWhen('2026-10-02T00:30:00Z'),'오전 9시 30분');
  c.HUB_NOW=()=>new Date('2026-10-02T15:00:00Z');assert.equal(t.hubFmtWhen('2026-10-02T00:30:00Z'),'2026.10.2 오전 9시 30분','한국 날짜가 10-03으로 넘어간 뒤');
});

test('ⓔ 꼴 글은 ⚙️ 허브 설정 time.* 키 — 키를 바꾸면 꼴이 바뀜(오늘에도 날짜를 붙이는 것 포함)',()=>{
  const base=withEngine([]);
  base.HUB_NOW=()=>new Date(NOW);
  assert.equal(base.t.hubFmtDateTime('2026-09-09 09:30'),'2026.9.9 오전 9시 30분','표가 비어 있으면 기본 꼴');
  const c1=withEngine([{key:'time.fmt_today',value:'{date} {time}'}]);c1.HUB_NOW=()=>new Date(NOW);
  assert.equal(c1.t.hubFmtWhen('2026-10-02T00:30:00Z'),'2026.10.2 오전 9시 30분','오늘도 날짜가 붙음');
  assert.equal(c1.t.hubFmtDateTime('2026-09-09 09:30'),'2026.9.9 오전 9시 30분','다른 꼴은 그대로');
  const c2=withEngine([{key:'time.am',value:'AM'},{key:'time.pm',value:'PM'},{key:'time.fmt_time',value:'{h}:{mi} {ampm}'},{key:'time.fmt_time_hour',value:'{h}시 정각 {ampm}'}]);
  assert.equal(c2.t.hubFmtTime('15:31'),'3:31 PM');assert.equal(c2.t.hubFmtTime('15:00'),'3시 정각 PM');assert.equal(c2.t.hubFmtTime('00:00'),'12시 정각 AM');
  const c3=withEngine([{key:'time.fmt_date',value:'{y}년 {m}월 {d}일'},{key:'time.fmt_datetime',value:'{date}, {time}'}]);
  assert.equal(c3.t.hubFmtDateTime('2026-09-09 09:30'),'2026년 9월 9일, 오전 9시 30분');assert.equal(c3.t.hubFmtDate('2026-09-09'),'2026년 9월 9일');
  const c4=withEngine([{key:'time.fmt_md_time',value:'{m}/{d} {time}'}]);
  assert.equal(c4.t.ownerBoardHumanizeTimes('<td>10-02 20:13</td>'),'<td>10/2 오후 8시 13분</td>');
  // 공백뿐인 글은 무시하고 기본 글
  const c5=withEngine([{key:'time.fmt_datetime',value:'   '}]);assert.equal(c5.t.hubFmtDateTime('2026-09-09 09:30'),'2026.9.9 오전 9시 30분');
  // 표를 못 읽어도(엔진 없음) 기본 글
  assert.equal(plain().t.hubFmtDateTime('2026-09-09 09:30'),'2026.9.9 오전 9시 30분');
});

function loadMd(){
  const src=hr.match(/const md=s=>\{[^\n]*\};\n/)?.[0];assert.ok(src,'md 함수');
  const c={};vm.createContext(c);vm.runInContext(timeBlock+'\n'+src+';this.md=md;',c);return c.md;
}
test('ⓕ md: 날짜만이면 지금처럼 「10/02」, 시각이 있으면 새 꼴(UTC 원문 「10/02T01:26:00.000Z」이 보이던 버그 수정)',()=>{
  const md=loadMd();
  assert.equal(md('2026-10-02'),'10/02');assert.equal(md(''),'');assert.equal(md(null),'');assert.equal(md(undefined),'');
  assert.equal(md('2026-10-02T01:26:00.000Z'),'2026.10.2 오전 10시 26분');
  assert.equal(md('2026-10-02T01:26:00+00:00'),'2026.10.2 오전 10시 26분');
  assert.equal(md('2026-10-02 10:26'),'2026.10.2 오전 10시 26분');
  assert.equal(md('2026-10-02T15:00:00Z'),'2026.10.3 오전 12시');
  assert.ok(!/T\d|Z/.test(md('2026-10-02T01:26:00.000Z')));
  assert.equal(md('2026-10-02Txx'),'10/02Txx','읽을 수 없는 값은 지금처럼');
  assert.equal(md('이상한 글'),'');   // 시각이 없는 글자는 지금처럼 앞 5글자를 자름
});

function loadFns(names,extra){
  const c=Object.assign({},extra||{});vm.createContext(c);
  const srcs=names.map(n=>{const m=hr.match(new RegExp('function '+n+'\\([^\\n]*\\)\\{(?:[^\\n]*\\}\\n|\\n[\\s\\S]*?\\n\\}\\n)'));assert.ok(m,n);return m[0];});
  vm.runInContext(timeBlock+'\n'+srcs.join('\n')+';this.f={'+names.join(',')+'};',c);return c.f;
}
test('ⓕ-2 그 밖의 시각 함수: 원장 보기판 올라온 때 · 카카오 덴트웹 입력 시각 · AI 사용량 마지막 동기화(전부 한국 시각)',()=>{
  const f=loadFns(['ownerBoardsTimestamp','formatKakaoDentwebStamp','aiUsageSyncedLabel']);
  assert.equal(f.ownerBoardsTimestamp('2026-09-30T01:02:00Z'),'2026.9.30 오전 10시 2분');assert.equal(f.ownerBoardsTimestamp(''),'');assert.equal(f.ownerBoardsTimestamp(null),'');
  assert.equal(f.formatKakaoDentwebStamp('2026-09-30T03:30:00Z'),'2026.9.30 오후 12시 30분');assert.equal(f.formatKakaoDentwebStamp(''),'');assert.equal(f.formatKakaoDentwebStamp('깨진값'),'깨진값');
  assert.equal(f.aiUsageSyncedLabel('2026-10-01T01:00:00Z'),'2026.10.1 오전 10시');assert.equal(f.aiUsageSyncedLabel('g'),'g');
  const lt=loadFns(['formatLeaveTimestamp']);
  assert.equal(lt.formatLeaveTimestamp('2026-09-01T09:00:00Z'),'2026.9.1 오후 6시');assert.equal(lt.formatLeaveTimestamp(''),'');assert.equal(lt.formatLeaveTimestamp(null),'');
});

/* ───── ⓖ 원장 보기판 ───── */
test('ⓖ ownerBoardHumanizeTimes: KST 사라짐 · 「MM-DD HH:MM」 바뀜 · 전화번호·날짜만·버전 글자는 그대로 · script/style/textarea/속성/주석 안은 그대로',()=>{
  const {t}=plain(),H=t.ownerBoardHumanizeTimes;
  assert.equal(H('<p>2026-10-02 15:30 KST 갱신</p>'),'<p>2026.10.2 오후 3시 30분 갱신</p>');
  assert.equal(H('<p>2026-10-02 15:30 (KST) 갱신</p>'),'<p>2026.10.2 오후 3시 30분 갱신</p>');
  assert.equal(H('<p>(2026-10-02 15:30 KST)</p>'),'<p>(2026.10.2 오후 3시 30분)</p>');
  assert.equal(H('<td>2026-10-02T15:30:00</td>'),'<td>2026.10.2 오후 3시 30분</td>','시간대 없는 ISO는 한국 시각');
  assert.equal(H('<td>2026-10-01T15:30:00.000Z</td>'),'<td>2026.10.2 오전 12시 30분</td>','Z는 한국 시각으로 바꿔 날짜가 넘어감');
  assert.equal(H('<td>2026-10-01 15:30:00+00:00</td>'),'<td>2026.10.2 오전 12시 30분</td>');
  assert.equal(H('<td>10-02 20:13</td>'),'<td>10.2 오후 8시 13분</td>');
  assert.equal(H('<td>10-02 08:05:09</td>'),'<td>10.2 오전 8시 5분</td>');
  assert.equal(H('<td>메모 15:30 KST 에 확인</td>'),'<td>메모 오후 3시 30분 에 확인</td>');
  assert.equal(H('<td>15:30:00 KST</td>'),'<td>오후 3시 30분</td>');
  assert.equal(H('<b>시각(KST) 기준</b>'),'<b>시각 기준</b>');
  assert.equal(H('<b>KST 기준 정렬</b>'),'<b> 기준 정렬</b>');
  assert.equal(H('<b>한국 시간(KST)</b>'),'<b>한국 시간</b>');
  // 그대로 두는 것
  for(const keep of ['<p>전화 010-1234-5678</p>','<p>버전 1.2.3</p>','<p>2026-10-02</p>','<p>10-02</p>','<p>비율 3:2 · 점수 10:20</p>','<p>2026-13-45 25:61</p>','<p>13-45 25:61</p>','<p>KSTA 와 AKST</p>','<p>0412345678</p>'])assert.equal(H(keep),keep,keep);
  // 시간 범위 「10:00-11:00」 뒤쪽을 시간대로 읽지 않음(뒤쪽 11:00은 그대로 둠)
  assert.ok(H('<p>2026-10-02 10:00-11:00</p>').includes('-11:00'));
  assert.ok(H('<p>2026-10-02 10:00-11:00</p>').startsWith('<p>2026.10.2 오전 10시'));
  // 태그 안(속성) · script · style · textarea · 주석은 그대로, 글자 부분만 바꿈
  const src='<div title="2026-10-02 15:30 KST" data-t=\'10-02 20:13\'>10-02 20:13</div>'
    +'<script>var t="2026-10-02 15:30 KST";if(a<b&&c>d){x="10-02 20:13"}</script>'
    +'<style>.a::after{content:"10-02 20:13 KST"}</style><textarea>2026-10-02 15:30 KST</textarea>'
    +'<!-- 2026-10-02 15:30 KST --><a title="a > b 10-02 20:13" href="x">15:30 KST</a>';
  assert.equal(H(src),'<div title="2026-10-02 15:30 KST" data-t=\'10-02 20:13\'>10.2 오후 8시 13분</div>'
    +'<script>var t="2026-10-02 15:30 KST";if(a<b&&c>d){x="10-02 20:13"}</script>'
    +'<style>.a::after{content:"10-02 20:13 KST"}</style><textarea>2026-10-02 15:30 KST</textarea>'
    +'<!-- 2026-10-02 15:30 KST --><a title="a > b 10-02 20:13" href="x">오후 3시 30분</a>');
  // 글자 속의 낱개 < · 엔티티
  assert.equal(H('<p>a < b 10-02 20:13</p>'),'<p>a < b 10.2 오후 8시 13분</p>');
  assert.equal(H('<p>&lt;10-02 20:13&gt;</p>'),'<p>&lt;10.2 오후 8시 13분&gt;</p>');
  // 대문자 태그·닫는 태그 · 닫히지 않은 script
  assert.equal(H('<SCRIPT>10-02 20:13</SCRIPT><P>10-02 20:13</P>'),'<SCRIPT>10-02 20:13</SCRIPT><P>10.2 오후 8시 13분</P>');
  assert.equal(H('<script>10-02 20:13 KST'),'<script>10-02 20:13 KST','닫히지 않아도 안 깨짐');
  assert.equal(H(''),'');assert.equal(H(null),'');assert.equal(H(undefined),'');assert.equal(H('시각 없는 글'),'시각 없는 글');
  // 원본 문자열은 안 바뀜(새 글자를 돌려줌)
  const orig='<p>10-02 20:13 KST</p>';H(orig);assert.equal(orig,'<p>10-02 20:13 KST</p>');
});
test('ⓖ-2 운영 장부판 같은 큰 HTML(50만 자)도 빠르고, 결과에 KST가 남지 않고 시각 꼴이 새 꼴로 바뀜',()=>{
  const {t}=plain();
  let rows='';
  for(let i=0;rows.length<520000;i++){
    const d=String(1+(i%28)).padStart(2,'0'),h=String(i%24).padStart(2,'0'),m=String((i*7)%60).padStart(2,'0');
    rows+='<tr class="r" data-id="'+i+'"><td title="2026-09-'+d+' '+h+':'+m+'">09-'+d+' '+h+':'+m+'</td><td>2026-09-'+d+'T'+h+':'+m+':00.000Z</td><td>메모 '+h+':'+m+' KST 에 갱신 · 전화 010-1234-5678 · v1.2.3 · 2026-09-'+d+'</td></tr>\n';
  }
  const html='<html><head><style>td{color:red}</style></head><body><table>'+rows+'</table><script>var data={"a":"10-02 20:13 KST"};</script></body></html>';
  assert.ok(html.length>=500000);
  const t0=Date.now(),out=t.ownerBoardHumanizeTimes(html),ms=Date.now()-t0;
  assert.ok(ms<3000,'50만 자 변환 시간 '+ms+'ms');
  const body=out.slice(0,out.indexOf('<script>'));
  assert.ok(!/KST/.test(body),'본문에 KST 없음');
  assert.ok(out.includes('var data={"a":"10-02 20:13 KST"};'),'script 안은 그대로');
  assert.ok(out.includes('<td title="2026-09-01 00:00">9.1 오전 12시</td>'),'속성은 그대로 · 글자는 바뀜');
  assert.ok(out.includes('010-1234-5678 · v1.2.3 · 2026-09-01'),'전화번호·버전·날짜만은 그대로');
  assert.ok(!/\d{2}-\d{2} \d{2}:\d{2}<\/td>/.test(out.replace(/title="[^"]*"/g,'')),'글자로 남은 MM-DD HH:MM 없음');
  assert.equal(t.ownerBoardHumanizeTimes(out).length>0,true);
});

/* ───── ⓘ 컴퓨터 시간대와 무관 ───── */
test('ⓘ 시험 컴퓨터 시간대를 UTC·미국 서부로 바꿔도 결과가 같다',()=>{
  const script=`const fs=require('fs'),vm=require('vm');const hr=fs.readFileSync(process.argv[1],'utf8').replace(/\\r\\n/g,'\\n');
    const b=hr.match(/\\/\\* hub-time:test-start \\*\\/[\\s\\S]*?\\/\\* hub-time:test-end \\*\\//)[0];const c={};vm.createContext(c);
    vm.runInContext(b+';this.t={hubFmtDateTime,hubFmtTime,hubFmtDate,hubFmtWhen,ownerBoardHumanizeTimes};',c);c.HUB_NOW=()=>new Date('2026-10-02T03:00:00Z');
    const t=c.t;console.log(JSON.stringify([t.hubFmtDateTime('2026-10-01T15:30:00Z'),t.hubFmtDateTime(new Date('2026-09-09T00:30:00Z')),t.hubFmtDateTime('2026-09-09 09:30'),t.hubFmtTime('2026-10-01T15:00:00Z'),t.hubFmtWhen('2026-10-02T00:30:00Z'),t.hubFmtWhen('2026-10-01T14:59:00Z'),t.hubFmtDate(Date.UTC(2026,11,31,15)),t.ownerBoardHumanizeTimes('<td>2026-10-01T15:30:00Z</td><td>10-02 20:13 KST</td>')]));`;
  const run=tz=>cp.execFileSync(process.execPath,['-e',script,path.join(root,'hr.html')],{env:Object.assign({},process.env,{TZ:tz}),encoding:'utf8'}).trim();
  const want=JSON.stringify(['2026.10.2 오전 12시 30분','2026.9.9 오전 9시 30분','2026.9.9 오전 9시 30분','오전 12시','오전 9시 30분','2026.10.1 오후 11시 59분','2027.1.1','<td>2026.10.2 오전 12시 30분</td><td>10.2 오후 8시 13분</td>']);
  for(const tz of ['UTC','America/Los_Angeles','Asia/Seoul','Pacific/Auckland'])assert.equal(run(tz),want,tz);
});

/* ───── ⑥ 화면 호출부 연결(정적) ───── */
test('⑥ 화면 연결: 기록된 시각을 보여 주는 곳이 새 함수를 쓰고, 바꾸지 않는 곳(입력칸 값·저장 값·정렬 키·법적 문서)은 그대로',()=>{
  assert.match(hr,/function formatLeaveTimestamp\(value\)\{\n\s*if\(!value\)return '';\n\s*return hubFmtDateTime\(value\);\n\}/);
  assert.match(hr,/function formatKakaoDentwebStamp\(value\)\{return hubFmtDateTime\(value\);\}/);
  assert.match(hr,/function ownerBoardsTimestamp\(value\)\{return value\?hubFmtDateTime\(value\):'';\}/);
  assert.match(hr,/function aiUsageSyncedLabel\(iso\)\{return hubFmtDateTime\(iso\);\}/);
  assert.match(hr,/frame\.srcdoc=ownerBoardSrcdoc\(ownerBoardHumanizeTimes\(data\.html\)\)/,'원장 보기판은 바꾼 글자를 iframe에 넣음');
  assert.match(hr,/\{generated:hubFmtDateTime\(cost\.generated\)/);assert.match(hr,/\{generated:hubFmtDateTime\(external\.generated\)/);assert.match(hr,/\{generated:hubFmtDateTime\(sessions\.generated\)/);
  assert.match(hr,/\$\{esc\(hubFmtWhen\(r\.bank_dt\)\)\}/,'입금 목록');assert.ok(!/dtf\.format/.test(hr),'입금 목록 옛 서식기 없음');
  assert.equal((hr.match(/\$\{esc\(hubFmtTime\(r\.clock_in\)\|\|'-'\)\} ~ \$\{esc\(hubFmtTime\(r\.clock_out\)\|\|'-'\)\}/g)||[]).length,2,'지문 오류 승인 근태 · 수기 출퇴근 검토');
  assert.match(hr,/hubFmtTime\(fp\.clock_in\)/);
  assert.match(hr,/<td>\$\{esc\(hubFmtTime\(a\.clock_in\)\|\|'-'\)\}/);assert.match(hr,/\{v:hubFmtTime\(a\.original_clock_in\)\|\|'-'\}/);assert.match(hr,/\{v:hubFmtTime\(a\.original_clock_out\)\|\|'-'\}/);
  assert.match(hr,/r\.ci!=null\?esc\(hubFmtTime\(r\.ci\)\):'-'/);
  assert.match(hr,/r\.approved_at\?esc\(hubFmtDate\(r\.approved_at\)\):'-'/);
  assert.match(ai,/typeof hubFmtWhen==='function'\?hubFmtWhen\(x\.last_at\)/,'AI 도우미 대화록 목록');
  // 바꾸지 않는 것: 저장·전송 값은 옛 그대로
  assert.match(hr,/clock_in:r\.ci!=null\?minToT\(r\.ci\)\+':00':null/,'엑셀 → DB 저장 값');
  assert.match(hr,/p_clock_in:clockIn,p_clock_out:clockOut/,'수기 출퇴근 보내는 값');
  assert.match(hr,/const toMin=t=>\{if\(!t\)return null;/,'시각 계산용 toMin');
  assert.match(hr,/function stampDate\(s\)\{/);assert.match(hr,/function contractDate\(s\)\{return s\?stampDate\(s\):'-';\}/,'계약서·신청서 날짜는 그대로');
  // 옛 KST 글자는 허브 화면 코드에 원래 없음(보기판 원본에만 있음)
  assert.ok(!/KST/.test(hr.replace(/ownerBoardHumanize[\s\S]*?\/\* hub-time:test-end \*\//,'')),'hr.html 화면 코드에 KST 글자 없음(보기판 변환 함수 설명 제외)');
});

/* ───── ⑦ hub-texts.js ───── */
test('⑦ time.* 키 8개: hub-texts.js 기본 글·{자리표시자} = hr.html 공통 함수의 기본 글',()=>{
  const defs=withEngine([]).t.hubTextDefs().filter(d=>/^time\./.test(d.key));
  assert.equal(defs.length,8);assert.equal(new Set(defs.map(d=>d.key)).size,8);
  assert.deepEqual(clone([...new Set(defs.map(d=>d.screen))]),['⏰ 시간 표시']);
  for(const d of defs){assert.ok(d.where&&d.where.length>10&&d.def.length>0,d.key);}
  const used=new Map();
  for(const m of timeBlock.matchAll(/hubTmT\('(time\.[a-z_]+)','([^']*)'(?:,\{([^}]*)\})?/g))used.set(m[1],{def:m[2],vars:(m[3]||'').split(',').map(s=>s.split(':')[0].trim()).filter(Boolean)});
  assert.deepEqual(clone([...used.keys()].sort()),clone(defs.map(d=>d.key).sort()),'화면(hr.html)에서 쓰는 키 = 목록의 키');
  for(const d of defs){
    const u=used.get(d.key);assert.equal(u.def,d.def,d.key+' 기본 글이 화면 코드와 같음');
    const ph=[...d.def.matchAll(/\{([a-z_]+)\}/g)].map(m=>m[1]);
    for(const p of ph)assert.ok((d.vars||[]).includes(p),d.key+' 기본 글의 {'+p+'}는 자리표시자 목록에 있음');
    for(const p of (d.vars||[]))assert.ok(u.vars.includes(p),d.key+' 자리표시자 {'+p+'}를 화면 코드가 채워 줌');
    assert.ok(!/KST/.test(d.def+d.where));
  }
  // 목록 등록
  assert.ok(js.includes('hubTextDefsTime(add);'));
});

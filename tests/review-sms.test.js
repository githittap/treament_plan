const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const html=read('hr.html'),texts=read('hub-texts.js'),sql=read('db/review_sms_20261127.sql');
const pure=html.match(/\/\* review-sms:test-start \*\/([\s\S]*?)\/\* review-sms:test-end \*\//)[1];
const recall=html.match(/\/\* recall-list:test-start \*\/([\s\S]*?)\/\* recall-list:test-end \*\//)[1];
function context(extra={}){const c={inboxT:(k,d,v)=>String(d).replace(/\{([a-z_]+)\}/g,(m,k)=>v?.[k]??m),esc:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),inboxSourceLabel:x=>x,inboxFormatContact:x=>x,nameOf:x=>x,formatLeaveTimestamp:x=>x,canManageConsultation:()=>true,...extra};vm.createContext(c);vm.runInContext(recall+pure+';this.h={reviewSmsCanAccess,reviewSmsSettings,reviewSmsParsePhones,reviewSmsBuildText,reviewSmsForbidden,reviewSmsBytes,reviewSmsSummary,reviewSmsLogHtml,reviewSmsErrorText,reviewSmsRelayLine,REVIEW_SMS_TEMPLATE_DEFAULT,REVIEW_SMS_FORBIDDEN};',c);return c.h;}

test('리뷰 요청은 문의함 하위 화면이고 리콜 명단과 같은 사람만 쓴다',()=>{
  const h=context();for(const role of ['owner','manager','chief'])assert.equal(h.reviewSmsCanAccess({role}),true);
  assert.equal(h.reviewSmsCanAccess({role:'staff',dept:'데스크'}),true);assert.equal(h.reviewSmsCanAccess({role:'staff',dept:'진료실'}),false);assert.equal(h.reviewSmsCanAccess(null),false);
  assert.match(html,/if\(INBOX_SUBTAB==='review'&&typeof reviewSmsEnabled==='function'&&reviewSmsEnabled\(\)\)\{m\.innerHTML=reviewSmsCardHtml\(\);await reviewSmsLoad\(\);return;\}/);
  assert.match(html,/onclick="inboxSetSubtab\(\\'review\\'\)"/);
  assert.match(html,/SETTINGS\['review_sms\.enabled'\]==='true'/);
  assert.match(html,/function reviewSmsEnabled\(\)\{return !!ME&&ME\.role==='owner'&&/,'환자 발송 영구 중지(11-27) 뒤 화면은 원장만');
  assert.match(sql,/public\.recall_user_allowed\(auth\.uid\(\)\)/,'DB도 리콜 명단과 같은 사람');
});

test('번호는 한 줄에 한 명 · 휴대폰만 · 같은 번호는 한 번만',()=>{
  const h=context(),r=h.reviewSmsParsePhones('010-1111-2222\n 01033334444 \n010 1111 2222\n02-123-4567\n\n홍길동 01055556666');
  assert.deepEqual(Array.from(r.phones),['01011112222','01033334444']);assert.deepEqual(Array.from(r.bad),['02-123-4567','홍길동 01055556666']);
});

test('기본 문구에는 병원 이름·이름 자리·주소 자리만 있고 대가·별점 낱말이 없다(DB 기본값과 같음)',()=>{
  const h=context();assert.equal(h.reviewSmsForbidden(h.REVIEW_SMS_TEMPLATE_DEFAULT),false);
  const dbDefault=sql.match(/\('review_sms\.template','([\s\S]*?)','리뷰 요청 문자 — 문자 문구/)[1];assert.equal(dbDefault,h.REVIEW_SMS_TEMPLATE_DEFAULT);
  assert.equal(sql.match(/~ '(\(할인[^']*)'/)[1],h.REVIEW_SMS_FORBIDDEN.source,'화면과 DB의 금지 낱말 목록이 같다');
  for(const bad of ['리뷰 쓰시면 다음 진료 할인','쿠폰 드려요','별점 5점 부탁','좋은 리뷰 부탁드립니다','추첨으로 상품권'])assert.equal(h.reviewSmsForbidden(bad),true,bad);
  const text=h.reviewSmsBuildText(h.REVIEW_SMS_TEMPLATE_DEFAULT,'홍길동','https://g.page/r/x/review');
  assert.match(text,/^\[아산정플란트치과\] 홍길동님,/);assert.match(text,/\nhttps:\/\/g\.page\/r\/x\/review$/);
  assert.match(h.reviewSmsBuildText(h.REVIEW_SMS_TEMPLATE_DEFAULT,'',''),/고객님/);
  assert.ok(h.reviewSmsBytes(text)>90,'기본 문구는 장문(LMS)으로 계산');
});

test('설정 읽기: 잘못된 값은 안전한 기본값 · 주소는 https만 · 시험 번호는 숫자만',()=>{
  const h=context(),s=h.reviewSmsSettings({'review_sms.enabled':'true','review_sms.live_enabled':'false','review_sms.test_numbers':'["010-1111-2222"]','review_sms.review_url':'javascript:alert(1)','review_sms.cooldown_days':'abc','review_sms.hours':'25:00-26:00','review_sms.sender':'041-555-1234'});
  assert.equal(s.live,false);assert.deepEqual(Array.from(s.tests),['01011112222']);assert.equal(s.url,'');assert.equal(s.cooldown,180);assert.equal(s.hours,'09:00-20:00');assert.equal(s.sender,'0415551234');
  assert.deepEqual(Array.from(h.reviewSmsSettings({'review_sms.test_numbers':'not json'}).tests),[]);
  assert.equal(h.reviewSmsSettings({}).template,h.REVIEW_SMS_TEMPLATE_DEFAULT);
});

test('결과 요약과 기록 표: 번호는 끝 4자리만, 이름·오류는 이스케이프',()=>{
  const h=context();assert.equal(h.reviewSmsSummary([{status:'sent'},{status:'blocked_test_only'},{status:'sent'}]),'✅ 보냄 2 · ⏸ 시험 모드라 안 보냄 1');
  const markup=h.reviewSmsLogHtml([{created_at:'t',sent_by:'u',phone_tail:'2222',patient_label:'<img onerror=x>',mode:'test',status:'failed',error:'<script>'}]);
  assert.match(markup,/\*\*\*\*2222/);assert.doesNotMatch(markup,/<img|<script>/);assert.match(markup,/시험/);
  assert.equal(h.reviewSmsErrorText('access_denied'),'리뷰 요청 문자를 보낼 권한이 없습니다.');
});

test('보내기는 서버 함수만 부르고 확인 창을 거치며, 설정 저장은 원장만 app_settings에 쓴다',()=>{
  const send=html.slice(html.indexOf('async function reviewSmsSend(){'),html.indexOf('async function reviewSmsSaveSettings(){'));
  assert.match(send,/confirm\(/);assert.match(send,/sb\.functions\.invoke\('review-sms',\{body:\{phones:parsed\.phones,name:name\|\|null\}\}\)/);assert.doesNotMatch(send,/from\('review_sms_log'\)/);
  const save=html.slice(html.indexOf('async function reviewSmsSaveSettings(){'),html.indexOf('async function renderInbox(m){'));
  assert.match(save,/if\(ME\.role!=='owner'/);assert.match(save,/from\('app_settings'\)\.upsert/);assert.doesNotMatch(save,/review_sms\.live_enabled|live_confirm/,'환자 실제 발송 켜기는 저장하지 않음');
  assert.match(read('supabase/config.toml'),/\[functions\.review-sms\]\nverify_jwt = true/);
});

test('리뷰 화면 글은 허브 설정 글 고치기에 등록되어 있다',()=>{
  const block=texts.match(/\/\* hub-texts:test-start \*\/([\s\S]*?)\/\* hub-texts:test-end \*\//)[1],c={HUB_RECALL_CATALOG:true};vm.createContext(c);vm.runInContext(block+';this.defs=hubTextDefs();this.help=HUB_HELP_TABS;',c);
  const keys=new Set(c.defs.map(d=>d.key)),used=new Set([...html.matchAll(/reviewT\('([a-z_]+)',/g)].map(m=>'review.'+m[1]));
  for(const k of used)assert.ok(keys.has(k),'글 고치기 누락: '+k);
  for(const st of ['pending','sent','failed','not_configured','blocked_test_only','blocked_recent','blocked_hours','blocked_wording'])assert.ok(keys.has('review.st_'+st),st);
  assert.ok(c.help.some(t=>t.key==='inbox.review'));
});

const pkg=process.env.PGLITE_PACKAGE_ROOT||'Z:/09_claude-output/_tmp/pglite-0.5.8/node_modules/@electric-sql/pglite';
test('PGlite: 권한·시험 모드·재발송 막기·문구·시간·결과 기록·롤백',{skip:!fs.existsSync(path.join(pkg,'dist/index.js'))&&'PGLITE_PACKAGE_ROOT 없음'},()=>{
  const log=execFileSync(process.execPath,['tests/sql/pglite-review-sms.mjs'],{cwd:root,env:{...process.env,PGLITE_PACKAGE_ROOT:pkg},encoding:'utf8',timeout:120000});
  assert.match(log,/PGLITE_REVIEW_SMS_PASS/);
});

test('병원 PC 중계 줄: 기록 없음·20분 넘게 소식 없음·오류·정상(잔액)',()=>{
  const h=context(),now=Date.parse('2026-11-27T01:30:00Z');
  assert.equal(h.reviewSmsRelayLine('',now).level,'none');assert.equal(h.reviewSmsRelayLine('not json',now).level,'none');
  assert.equal(h.reviewSmsRelayLine(JSON.stringify({seen_at:'2026-11-27T01:00:00Z',balance:0,point:300}),now).level,'ok','30분 소식 없음은 정상(30분마다 살아 있음 신호)');
  const stale=h.reviewSmsRelayLine(JSON.stringify({seen_at:'2026-11-27T00:10:00Z',balance:0,point:300}),now);assert.equal(stale.level,'stale');assert.match(stale.text,/80분째/);
  assert.equal(h.reviewSmsRelayLine(JSON.stringify({seen_at:'2026-11-27T01:25:00Z',error:'IP 막힘'}),now).level,'warn');
  const ok=h.reviewSmsRelayLine(JSON.stringify({seen_at:'2026-11-27T01:25:00Z',balance:12000,point:300}),now);assert.equal(ok.level,'ok');assert.match(ok.text,/잔액 12,000원 \+ 포인트 300/);
  assert.match(html,/id="reviewSmsRelay"/);assert.match(html,/eq\('key','review_sms\.relay_status'\)/);
  assert.match(html,/rows\.some\(r=>r\.status==='pending'\)/,'대기 중이면 병원 PC 안내 + 자동 새로 조회');
});

test('PGlite: 병원 PC 중계 — 대기함·한 번만 꺼냄·번호 지움·시간·만료·되돌리기',{skip:!fs.existsSync(path.join(pkg,'dist/index.js'))&&'PGLITE_PACKAGE_ROOT 없음'},()=>{
  const log=execFileSync(process.execPath,['tests/sql/pglite-review-sms-relay.mjs'],{cwd:root,env:{...process.env,PGLITE_PACKAGE_ROOT:pkg},encoding:'utf8',timeout:120000});
  assert.match(log,/PGLITE_REVIEW_SMS_RELAY_PASS/);
});

test('환자 리뷰 문자 영구 중지(원장 11-27): 화면에 켜는 칸 없음 · 안내 줄 · DB가 막음',()=>{
  assert.doesNotMatch(html,/id="reviewSmsLive"/,'켜는 칸 없앰');assert.match(html,/reviewT\('mode_stopped_banner'/);assert.match(html,/reviewT\('set_live_stopped'/);
  assert.doesNotMatch(html,/mode_live_banner/,'실제 발송 중 안내는 안 씀');
  const stop=read('db/review_sms_stop_20261127.sql');assert.match(stop,/create trigger review_sms_live_guard/);assert.match(stop,/'review_sms\.live_enabled','false'/);
  assert.match(read('db/review_sms_stop_20261127_rollback.sql'),/drop trigger if exists review_sms_live_guard/);
});

test('중계 상태 「기타 알파」 줄: 발신번호·잔액 알림·자동 충전·카카오·최근 문자·마지막 신호 · 새로 확인 단추',()=>{
  const h=context(),now=Date.parse('2026-11-27T01:30:00Z');
  const st={seen_at:'2026-11-27T01:25:00Z',checked_at:'2026-11-27T00:05:00Z',balance:45000,point:255,sender_ok:true,sender_tail:'1852',low_alert:{on:true,at:200},auto_recharge:false,kakao:{channels:1,approved:0,inspecting:1,other:0},last_msg:{at:'2026-11-26T22:22:36Z',type:'LMS',tail:'1852',status:'수신 완료'}};
  const r=h.reviewSmsRelayLine(JSON.stringify(st),now);assert.equal(r.level,'ok');assert.match(r.text,/잔액 45,000원 \+ 포인트 255/);
  const d=Array.from(r.details).join(' | ');
  for(const re of [/발신번호 \*\*\*\*1852 · 솔라피 등록됨/,/200원 이하면 문자 알림 켜짐/,/자동 충전 꺼짐/,/카카오 채널 1개 연결 · 알림톡 템플릿 승인 0 · 검수 중 1/,/최근 보낸 문자 .* · LMS · \*\*\*\*1852 · 수신 완료/,/중계 마지막 신호/])assert.match(d,re);
  assert.equal(Array.from(h.reviewSmsRelayLine(JSON.stringify({seen_at:'2026-11-27T01:25:00Z'}),now).details).length,1,'없는 칸은 안 보임');
  assert.match(html,/onclick="reviewSmsRelayRefresh\(\)"/);assert.match(html,/upsert\(\[\{key:'review_sms\.relay_refresh_req'/);
});

test('PGlite: 환자 발송 영구 중지 — 끔·켜기 거절(update·upsert)·다른 칸 자유·되돌리기',{skip:!fs.existsSync(path.join(pkg,'dist/index.js'))&&'PGLITE_PACKAGE_ROOT 없음'},()=>{
  const log=execFileSync(process.execPath,['tests/sql/pglite-review-sms-stop.mjs'],{cwd:root,env:{...process.env,PGLITE_PACKAGE_ROOT:pkg},encoding:'utf8',timeout:120000});
  assert.match(log,/PGLITE_REVIEW_SMS_STOP_PASS/);
});

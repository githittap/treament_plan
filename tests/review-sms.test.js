const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const html=read('hr.html'),texts=read('hub-texts.js'),sql=read('db/review_sms_20261127.sql');
const pure=html.match(/\/\* review-sms:test-start \*\/([\s\S]*?)\/\* review-sms:test-end \*\//)[1];
const recall=html.match(/\/\* recall-list:test-start \*\/([\s\S]*?)\/\* recall-list:test-end \*\//)[1];
function context(extra={}){const c={inboxT:(k,d,v)=>String(d).replace(/\{([a-z_]+)\}/g,(m,k)=>v?.[k]??m),esc:s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),inboxSourceLabel:x=>x,inboxFormatContact:x=>x,nameOf:x=>x,formatLeaveTimestamp:x=>x,canManageConsultation:()=>true,...extra};vm.createContext(c);vm.runInContext(recall+pure+';this.h={reviewSmsCanAccess,reviewSmsSettings,reviewSmsParsePhones,reviewSmsBuildText,reviewSmsForbidden,reviewSmsBytes,reviewSmsSummary,reviewSmsLogHtml,reviewSmsErrorText,REVIEW_SMS_TEMPLATE_DEFAULT,REVIEW_SMS_FORBIDDEN};',c);return c.h;}

test('리뷰 요청은 문의함 하위 화면이고 리콜 명단과 같은 사람만 쓴다',()=>{
  const h=context();for(const role of ['owner','manager','chief'])assert.equal(h.reviewSmsCanAccess({role}),true);
  assert.equal(h.reviewSmsCanAccess({role:'staff',dept:'데스크'}),true);assert.equal(h.reviewSmsCanAccess({role:'staff',dept:'진료실'}),false);assert.equal(h.reviewSmsCanAccess(null),false);
  assert.match(html,/if\(INBOX_SUBTAB==='review'&&typeof reviewSmsEnabled==='function'&&reviewSmsEnabled\(\)\)\{m\.innerHTML=reviewSmsCardHtml\(\);await reviewSmsLoad\(\);return;\}/);
  assert.match(html,/onclick="inboxSetSubtab\(\\'review\\'\)"/);
  assert.match(html,/SETTINGS\['review_sms\.enabled'\]==='true'/);
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
  assert.match(save,/if\(ME\.role!=='owner'/);assert.match(save,/from\('app_settings'\)\.upsert/);assert.match(save,/live_confirm/);
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

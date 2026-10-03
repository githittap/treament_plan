const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'hr.html'),'utf8');
const block=(start,end)=>{const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a,`${start} test block exists`);return html.slice(a,b);};
function load(){
  const c={hubSettingChecked:()=>30,hubFmtWhen:value=>value?`시각:${value}`:'',hubT:(key,base,values)=>values?base.replace(/\{([a-z_]+)\}/g,(m,k)=>Object.hasOwn(values,k)?String(values[k]):m):base,esc:value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')};
  vm.createContext(c);vm.runInContext(`${block('/* inbox-first:test-start */','/* inbox-first:test-end */')};${block('/* consultation-inbox:test-start */','/* consultation-inbox:test-end */')};this.h={homeInboxRecentGroups,homeInboxRecentLine,homeInboxRecentDetailLine,inboxGroupRows};`,c);return c.h;
}
const row=(id,received_at,{source='phone',sender_name='같은 사람',message='문의',status='new'}={})=>({id,source,sender_name,message,status,received_at});

test('30분 이하는 묶고 30분을 넘으면 새 묶음으로 나눈다',()=>{
  const h=load(),groups=h.homeInboxRecentGroups([row('a','2026-10-01T00:00:00Z',{message:'이전'}),row('b','2026-10-01T00:30:00Z',{message:'최신'}),row('c','2026-10-01T01:00:00.001Z')]);
  assert.equal(groups.length,2);assert.deepEqual(JSON.parse(JSON.stringify(groups.map(g=>g.count))),[1,2]);assert.deepEqual(JSON.parse(JSON.stringify(groups[1].items.map(i=>i.message))),['최신','이전']);
});

test('같은 이름이어도 출처가 다르면 묶지 않는다',()=>{
  const h=load(),groups=h.homeInboxRecentGroups([row('phone','2026-10-01T00:00:00Z',{source:'phone'}),row('kakao','2026-10-01T00:01:00Z',{source:'kakao'})]);
  assert.equal(groups.length,2);assert.deepEqual(JSON.parse(JSON.stringify(groups.map(g=>g.source))),['카카오','전화']);
});

test('이름을 알 수 없는 문의는 문의마다 별도 묶음으로 둔다',()=>{
  const h=load(),groups=h.homeInboxRecentGroups([row('unknown-a','2026-10-01T00:00:00Z',{sender_name:'',message:'무명 문의'}),row('unknown-b','2026-10-01T00:01:00Z',{sender_name:'',message:'무명 문의'})]);
  assert.equal(groups.length,2);assert.deepEqual(JSON.parse(JSON.stringify(groups.map(g=>[g.name,g.count]))),[['미상',1],['미상',1]]);
});

test('홈 카드에는 최근 세 묶음만 최신 순으로 둔다',()=>{
  const h=load(),groups=h.homeInboxRecentGroups(['가','나','다','라'].map((name,i)=>row(String(i),`2026-10-01T00:0${i}:00Z`,{sender_name:name,message:name})));
  assert.equal(groups.length,3);assert.deepEqual(JSON.parse(JSON.stringify(groups.map(g=>g.name))),['라','다','나']);
});

test('단건 줄의 HTML은 기존 홈 문의함 행과 바이트 단위로 같다',()=>{
  const h=load(),g=h.homeInboxRecentGroups([row('one','2026-10-01T00:00:00Z',{source:'phone',sender_name:'홍길동',message:'상담 문의',status:'new'})])[0];
  const oldLine='<div class="hint" style="padding:5px 0;border-top:1px dashed var(--line)">시각:2026-10-01T00:00:00Z · 전화 · 홍길동 · <span class="b no">NEW(미처리)</span> · 상담 문의</div>';
  assert.equal(`<div class="hint" style="padding:5px 0;border-top:1px dashed var(--line)">${h.homeInboxRecentLine(g)}</div>`,oldLine);
});

test('상세 줄은 시각·상태·내용을 escape하고 묶음 줄은 기존 건수 글을 쓴다',()=>{
  const h=load();
  assert.equal(h.homeInboxRecentDetailLine({receivedAt:'2026-10-01T00:00:00Z',status:'new',message:'<img src=x>'}),'<div class="hint" style="padding:5px 0;border-top:1px dashed var(--line)">시각:2026-10-01T00:00:00Z · <span class="b no">NEW(미처리)</span> · &lt;img src=x&gt;</div>');
  assert.match(h.homeInboxRecentLine({receivedAt:'2026-10-01T00:00:00Z',source:'전화',name:'홍길동',message:'문의',status:'new',count:2},true),/\(2건\)$/);
  assert.match(html,/select\('id,source,received_at,sender_name,message,status'\)\.order\('received_at',\{ascending:false\}\)\.limit\(30\)/);
  assert.match(html,/recentRows=homeInboxRecentGroups\(recent\)/);assert.match(html,/row\.items\.map\(homeInboxRecentDetailLine\)/);
  const cardStart=html.indexOf('homeInboxCard=`'),cardMatch=html.slice(cardStart).match(/;\r?\n  }/),cardEnd=cardMatch?cardStart+cardMatch.index:-1,card=html.slice(cardStart,cardEnd);
  assert.ok(cardStart>=0&&cardEnd>cardStart,'홈 문의함 카드 템플릿이 있어야 한다');
  assert.match(card,/<details><summary class="hint" style="padding:5px 0;border-top:1px dashed var\(--line\);cursor:pointer">\$\{homeInboxRecentLine\(row,true\)\}<\/summary>/);
  assert.doesNotMatch(card,/<summary[^>]*>\s*<span/,'summary 글을 display:block span으로 감싸면 안 된다');
  assert.match(card,/`<div class="hint" style="padding:5px 0;border-top:1px dashed var\(--line\)">\$\{homeInboxRecentLine\(row\)\}<\/div>`/,'단건 행 HTML은 기존 모양으로 유지해야 한다');
});

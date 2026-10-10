const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const b=require('../payroll-bonus.js');
const csv='\uFEFF직원,근무월,무시하는열,상여(입금-세후),메모\r\n합성가,2026-09,무시,100,"제안, 첫 줄"\r\n합성나,2026-09,무시,0,"두 줄\n메모"\r\n동명,2026-10,무시,"1,200","따옴표 ""메모"""';
test('CSV 따옴표·BOM·쉼표·줄바꿈 보존, 활성 계정 하나만 연결·동명은 이름 키',()=>{
 const rows=b.bonusSuggestionsFromCsv(csv,[{user_id:'a',name:'합성가',active:true},{user_id:'old',name:'합성가',active:false},{user_id:'b',name:'동명'},{user_id:'c',name:'동명'}]);
 assert.equal(rows.length,3);assert.equal(rows[0].person_key,'a');assert.equal(rows[0].user_id,'a');assert.equal(rows[0].memo,'제안, 첫 줄');assert.equal(rows[1].amount,0);assert.equal(rows[1].memo,'두 줄\n메모');assert.equal(rows[2].person_key,'name:동명');assert.equal(rows[2].amount,1200);assert.equal(rows[2].memo,'따옴표 "메모"');assert.ok(rows.every(r=>!('무시하는열' in r)&&!('confirmed' in r)));
});
test('CSV 잘못된 머리줄·월·음수·금액·닫히지 않은 따옴표는 조용히 넣지 않음',()=>{
 for(const content of ['직원,근무월\n합성,2026-09','직원,근무월,상여(입금-세후),메모\n합성,2026-13,100,','직원,근무월,상여(입금-세후),메모\n합성,2026-09,-1,','직원,근무월,상여(입금-세후),메모\n합성,2026-09,잘못된금액,','직원,근무월,상여(입금-세후),메모\n"합성,2026-09,100,'])assert.throws(()=>b.bonusSuggestionsFromCsv(content,[]));
});
test('CSV는 로컬 미리보기 뒤 RPC로 제안 줄만 전송하고 파일 저장소 호출 없음',async()=>{
 const nodes={},calls=[],c={ME:{role:'owner'},PROFILES:[],hubT:(k,d,v)=>String(d).replace(/\{(\w+)\}/g,(m,k)=>v?.[k]??m),esc:v=>String(v??'').replace(/</g,'&lt;'),render:()=>{},confirm:()=>true,clearTimeout:()=>{},document:{querySelectorAll:()=>[]},$:k=>nodes[k]||(nodes[k]={}),sb:{from:()=>{throw Error('원본 파일·일반 upsert 금지');},rpc:async(name,args)=>{calls.push({name,args});return {data:{inserted:2,skipped:1}};}}};vm.createContext(c);vm.runInContext(fs.readFileSync('payroll-bonus.js','utf8'),c);
 await c.bonusReadSuggestions({text:async()=>csv});assert.match(nodes['#bonusImportPreview'].innerHTML,/합성가/);assert.equal(calls.length,0);
 await c.bonusImportSuggestions();assert.equal(calls.length,1);assert.equal(calls[0].name,'bonus_import_suggestions');assert.equal(calls[0].args.p_rows.length,3);assert.match(nodes['#bonusMessage'].textContent,/2/);assert.match(nodes['#bonusMessage'].textContent,/1/);
});
test('늦은 CSV 읽기와 직원 역할은 미리보기·저장을 덮지 않음',async()=>{
 let release;const nodes={},c={ME:{role:'owner'},PROFILES:[],hubT:(k,d)=>d,esc:String,$:k=>nodes[k]||(nodes[k]={})};vm.createContext(c);vm.runInContext(fs.readFileSync('payroll-bonus.js','utf8'),c);
 const first=c.bonusReadSuggestions({text:()=>new Promise(r=>release=r)});await c.bonusReadSuggestions({text:async()=>csv.replaceAll('합성가','최신합성')});release(csv);await first;assert.match(nodes['#bonusImportPreview'].innerHTML,/최신합성/);assert.doesNotMatch(nodes['#bonusImportPreview'].innerHTML,/합성가/);
 c.ME.role='staff';await c.bonusReadSuggestions({text:async()=>{throw Error('읽으면 안 됨');}});await c.bonusImportSuggestions();
});

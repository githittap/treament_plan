const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const purchase='삼성4430해외승인 합*성\nUSD 20.00\n10/05 12:00 TEST.AI';
const cancellation='삼성4430해외승인취소 합*성\nUSD 20.00\n10/06 12:00 TEST.AI';
test('백업 CLI는 중복과 거절을 제외하고 취소 연결·월 합계·원문 제외 파일을 만든다',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'card-ledger-import-'));
 const values=[purchase,'[Web발신] '+purchase,cancellation,'삼성4430거절 합성\n20,000원\n10/06 12:00 TEST','하나카드승인 합성'].map((text,i)=>({text,received_at:'2026-10-06T10:00:00Z',source_kind:i===2?'mms':'sms'}));
 const result=spawnSync(process.execPath,[path.join(root,'scripts/import_card_sms_backup.mjs'),'--out',out],{input:values.map(v=>JSON.stringify(v)).join('\n')+'\n',encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const summary=JSON.parse(fs.readFileSync(path.join(out,'summary.json'),'utf8')),rows=JSON.parse(fs.readFileSync(path.join(out,'card_transactions_import.json'),'utf8'));
 assert.equal(rows.length,2);assert.equal(summary.duplicates,1);assert.equal(summary.ignored,1);assert.equal(summary.failed,1);
 assert.equal(summary.paired_cancellations,1);assert.equal(summary.totals.USD,0);assert.equal(summary.months['2026-10'].krw_estimate,0);
 assert.deepEqual(summary.import_source_kinds,{sms:1,mms:1});
 assert.ok(!JSON.stringify(rows).includes('합*성'));assert.ok(!('body' in rows[0]));assert.ok(fs.readFileSync(path.join(out,'monthly_summary.csv'),'utf8').includes('2026-10,2,1,1,0,0,0'));
});
test('XML 변환은 MMS 수신 시각과 Unicode 가맹점을 잃지 않는다',t=>{
 const probe=spawnSync('python',['--version'],{encoding:'utf8'});if(probe.status!==0){t.skip('Python 미설치');return;}
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'card-ledger-mms-')),source=path.join(out,'synthetic.xml');
 const body='KB국민카드0051승인 합*성님\n21,116원 일시불\n10/06 12:00 테스트\u2028가맹점';
 const escape=s=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/\n/g,'&#10;');
 fs.writeFileSync(source,'<?xml version="1.0" encoding="UTF-8"?><smses><mms date="'+Date.parse('2026-10-06T03:01:00Z')+'"><parts><part ct="text/plain" text="'+escape(body)+'"/></parts></mms></smses>');
 const result=spawnSync('python',[path.join(root,'scripts/import_card_sms_backup.py'),'--source',source,'--out',out],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONIOENCODING:'utf-8'}});
 assert.equal(result.status,0,result.stderr);
 const rows=JSON.parse(fs.readFileSync(path.join(out,'card_transactions_import.json'),'utf8'));
 assert.equal(rows.length,1);assert.equal(rows[0].transaction_at,'2026-10-06T03:00:00.000Z');assert.equal(rows[0].amount_native,21116);
 assert.equal(rows[0].merchant,'테스트\u2028가맹점');
});

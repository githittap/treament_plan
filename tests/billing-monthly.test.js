const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('hr.html','utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
function context(extra={}){
  const c={Intl,Date,Number,String,Set,Map,Math,JSON,esc:s=>String(s),hubT:(k,d,v)=>String(d).replace(/\{([a-z_]+)\}/g,(m,n)=>v?.[n]??m),aicostMoney:n=>String(n),...extra};vm.createContext(c);
  for(const name of ['aicost-platform','marketing-expenses','billing-monthly']){
    const block=html.match(new RegExp('/\\* '+name+':test-start \\*/[\\s\\S]*?/\\* '+name+':test-end \\*/'))?.[0];assert.ok(block,name);vm.runInContext(block,c);
  }
  vm.runInContext('this.h={billingFetchAll,billingAiRows,billingAnnualRows,billingMarketingRows,billingBudgetHtml,billingMonthPicker,billingWriteWorkbook,saveAiMonthBudget};',c);return c;
}
const events=[
 {id:'a',event_kind:'purchase',parse_status:'recorded',transaction_at:'2026-09-30T15:00:00Z',currency:'KRW',amount_krw:1000,merchant:'Google Ads',merchant_key:'googleads'},
 {id:'b',event_kind:'cancellation',parse_status:'recorded',transaction_at:'2026-10-02T00:00:00Z',currency:'KRW',amount_krw:-1000,reversed_event_id:'a'},
 {id:'personal',parse_status:'recorded',transaction_at:'2026-10-02T00:00:00Z',currency:'KRW',amount_krw:99999,category_override:'not_marketing'},
 {id:'foreign',event_kind:'purchase',parse_status:'recorded',transaction_at:'2026-10-03T00:00:00Z',currency:'USD',amount_native:3,merchant_key:'googleads'}
];
test('monthly marketing export uses KST, refunds, marketing classification and no duplicate linked foreign charges',()=>{
 const h=context().h,rules=[{merchant_key:'googleads',category:'google'}];
 const rows=clone(h.billingMarketingRows(events,rules,[],'2026-10'));
 assert.deepEqual(rows.map(x=>x.amount),[1000,-1000,null]);assert.equal(rows[0].date,'2026-10-01');assert.equal(rows[2].currency,'USD');
 assert.equal(h.billingMarketingRows(events,rules,[{foreign_event_id:'foreign',krw_event_id:'a'}],'2026-10').length,2);
});
test('AI monthly export combines manual billing and normalized automatic events, excluding Naver advertising',()=>{
 const h=context().h,manual=[{ym:'2026-10',platform:'Claude',amount_krw:100},{ym:'2026-09',platform:'Kimi',amount_krw:800}],auto=[
 {received_at:'2026-09-30T15:00:00Z',platform:' deepseek ',amount_krw:200},
 {received_at:'2026-10-01T00:00:00Z',platform:'naver_ads',amount_krw:500},
 {received_at:'2026-10-01T00:00:00Z',platform:'Unknown',amount_krw:50}];
 const rows=clone(h.billingAiRows(manual,auto,'2026-10'));assert.equal(rows.reduce((s,x)=>s+x.amount,0),350);
 assert.deepEqual(rows.map(x=>x.category),['Claude','DeepSeek','기타']);assert.equal(rows[0].source,'manual');
});
test('annual spreadsheet includes all twelve months and keeps platform totals aligned',()=>{
 const h=context().h,rows=h.billingAnnualRows([{date:'2026-01-01',category:'google',amount:100},{date:'2026-12-31',category:'meta',amount:-20},{date:'2025-12-31',category:'google',amount:90}],['google','meta'],'2026');
 assert.equal(rows.length,12);assert.deepEqual(clone(rows[0]),['2026-01',100,0,100]);assert.deepEqual(clone(rows[11]),['2026-12',0,-20,-20]);
});
test('billing pagination loads beyond one page and stops with an error instead of exporting incomplete totals',async()=>{
 const h=context().h,all=Array.from({length:1205},(_,id)=>({id})),calls=[];
 const result=await h.billingFetchAll(()=>({range:async(a,b)=>{calls.push([a,b]);return {data:all.slice(a,b+1),error:null};}}));
 assert.equal(result.data.length,1205);assert.equal(calls.length,3);
 const bad=await h.billingFetchAll(()=>({range:async()=>({data:null,error:{message:'denied'}})}));assert.equal(bad.error.message,'denied');assert.equal(bad.data,null);
});
test('budget display handles unset, zero, refunds and overspending without an overflowing bar',()=>{
 const h=context().h;assert.doesNotMatch(h.billingBudgetHtml(null,100),/width:/);assert.doesNotMatch(h.billingBudgetHtml(0,100),/Infinity|NaN/);
 assert.match(h.billingBudgetHtml(100,150),/150%/);assert.match(h.billingBudgetHtml(100,150),/width:100%/);assert.match(h.billingBudgetHtml(100,-50),/width:0%/);
 assert.match(h.billingMonthPicker('2026-01'),/2025-12/);assert.match(h.billingMonthPicker('2026-12'),/2027-01/);
});
test('AI budget persists one month per existing app_settings key and rejects non-owner writes',async()=>{
 const writes=[],settings={},c=context({ME:{role:'owner'},AICOST_MONTH:'2026-10',SETTINGS:settings,$:()=>({value:'120000'}),setStatus:()=>{},render:()=>{},alert:()=>{},sb:{from:table=>({upsert:async row=>{writes.push({table,row});return {error:null};}})}});
 await c.h.saveAiMonthBudget();assert.deepEqual(clone(writes),[{table:'app_settings',row:{key:'aic.budget.2026-10',value:'120000'}}]);assert.equal(settings['aic.budget.2026-10'],'120000');
 c.ME.role='manager';await c.h.saveAiMonthBudget();assert.equal(writes.length,1);
 c.ME.role='owner';c.$=()=>({value:'-1'});await c.h.saveAiMonthBudget();assert.equal(writes.length,1);
});
test('workbook download creates real xlsx sheets and preserves numeric refund amounts',()=>{
 const calls=[],XLSX={utils:{book_new:()=>({}),aoa_to_sheet:rows=>rows,book_append_sheet:(wb,ws,name)=>calls.push({ws,name})},writeFile:(wb,name)=>calls.push({name})};
 const h=context({XLSX}).h;h.billingWriteWorkbook('billing.xlsx',[{name:'month',rows:[['date','amount'],['2026-10-01',-1000]]}]);
 assert.equal(calls[0].ws[1][1],-1000);assert.equal(calls[1].name,'billing.xlsx');
});
test('download handler selects only the displayed month and produces a twelve-month annual sheet',()=>{
 const sheets=[],files=[],c=context({ME:{role:'owner'},AICOST_MONTH:'2026-10',XLSX:{utils:{book_new:()=>({}),aoa_to_sheet:rows=>rows,book_append_sheet:(wb,rows)=>sheets.push(clone(rows))},writeFile:(wb,name)=>files.push(name)}});
 vm.runInContext(html.slice(html.indexOf('let BILLING_EXPORT_DATA='),html.indexOf('/* marketing-expenses:test-start */')),c);
 vm.runInContext("BILLING_EXPORT_DATA.ai={month:'2026-10',rows:[{date:'2026-10-01',merchant:'Claude',category:'Claude',amount:100,source:'manual'}],yearRows:[{date:'2026-09-01',category:'Claude',amount:50},{date:'2026-10-01',category:'Claude',amount:100}]};",c);
 c.aicostPlatformLabel=p=>p;c.exportBilling('ai',false);assert.equal(sheets[0].length,2);assert.equal(sheets[0][1][3],100);assert.match(files[0],/2026-10.*\.xlsx$/);
 c.exportBilling('ai',true);assert.equal(sheets[1].length,13);assert.equal(sheets[1][9][1],50);assert.equal(sheets[1][10][1],100);
 c.AICOST_MONTH='2026-11';c.exportBilling('ai',false);assert.equal(files.length,2);
});
test('failed AI budget writes preserve saved values and successful writes keep different months separate',async()=>{
 let error={message:'denied'},c=context({ME:{role:'owner'},AICOST_MONTH:'2026-10',SETTINGS:{'aic.budget.2026-09':'900'},$:()=>({value:'1200'}),setStatus:()=>{},render:()=>{},alert:()=>{},sb:{from:()=>({upsert:async()=>({error})})}});
 await c.h.saveAiMonthBudget();assert.equal(c.SETTINGS['aic.budget.2026-10'],undefined);assert.equal(c.SETTINGS['aic.budget.2026-09'],'900');
 error=null;await c.h.saveAiMonthBudget();assert.equal(c.SETTINGS['aic.budget.2026-10'],'1200');assert.equal(c.SETTINGS['aic.budget.2026-09'],'900');
});
test('all new monthly billing labels are registered in the owner-editable text catalog',()=>{
 const js=fs.readFileSync('hub-texts.js','utf8'),block=js.match(/\/\* hub-texts:test-start \*\/[\s\S]*?\/\* hub-texts:test-end \*\//)[0],c={};vm.createContext(c);vm.runInContext(block+';this.defs=hubTextDefs();this.text=hubText;this.set=hubTextSetOverrides;',c);
 const defs=c.defs.filter(d=>d.key.startsWith('bill.'));assert.equal(defs.length,25);assert.equal(new Set(defs.map(d=>d.key)).size,25);
 c.set([{key:'bill.export_month',value:'월 내역 받기'},{key:'bill.month',value:'{year} / {month}'}]);
 assert.equal(c.text('bill.export_month','default'),'월 내역 받기');assert.equal(c.text('bill.month','default',{year:2026,month:10}),'2026 / 10');
});

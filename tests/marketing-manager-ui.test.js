const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'hr.html'),'utf8'),hub=fs.readFileSync(path.join(root,'hub-texts.js'),'utf8');
const region=(s,name)=>s.match(new RegExp('/\\* '+name+':test-start \\*/[\\s\\S]*?/\\* '+name+':test-end \\*/'))[0];
const fn=name=>html.match(new RegExp('async function '+name+'\\([^]*?\\r?\\n\\}\\r?\\n'))[0];
const event=(id,merchant,key,category_override=null)=>({id,merchant,merchant_key:key,category_override,transaction_at:'2026-10-01T00:00:00Z',parse_status:'recorded',event_kind:'purchase',currency:'KRW',amount_native:1000,amount_krw:1000});
const events=[event('ad','Marketing ad','googleads'),event('private','Private excluded','googleads','not_marketing'),event('unknown','Private unclassified','unknown'),{...event('failed','Private failure','unknown'),parse_status:'failed',received_at:'2026-10-01T00:00:00Z'}];
function harness(role='manager',value='true',error=null){
  const calls=[],writes=[],nav={innerHTML:''},nav2={innerHTML:''};
  const tables={app_settings:{data:value===null?null:{key:'marketing.manager_view_enabled',value},error},marketing_expense_events:{data:events},marketing_month_budgets:{data:{month:'2026-10-01',amount_krw:5000}},marketing_merchant_rules:{data:[{merchant_key:'googleads',category:'google'}]},marketing_foreign_charge_links:{data:[]}};
  const ctx={ME:{id:'test',role},TAB_ROLES:{},TAB_OVERRIDES:{},BADGE:{},TAB:'aicost',today:()=> '2026-10-03',render(){},setStatus(){},hubT:(k,d,v)=>v?d.replace(/\{(\w+)\}/g,(m,k)=>v[k]??m):d,esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),formatLeaveTimestamp:v=>v,$:s=>s==='#nav'?nav:nav2,aicostMoney:v=>Number(v||0).toLocaleString('ko-KR'),
    sb:{from(table){calls.push(table);if(!tables[table])throw Error('unexpected private query '+table);const api={select(){return api;},eq(){return api;},maybeSingle(){return Promise.resolve(tables[table]);},order(){return api;},range(){return Promise.resolve(tables[table]);},upsert(){writes.push(table);return api;},update(){writes.push(table);return api;},delete(){writes.push(table);return api;},then(resolve,reject){return Promise.resolve(tables[table]).then(resolve,reject);}};return api;}}};
  vm.createContext(ctx);
  vm.runInContext(hub,ctx);ctx.hubT=(k,d,v)=>ctx.hubText(k,d,v);ctx.HubUi.setSettings(value===null?{}:{'marketing.manager_view_enabled':value});
  const tabs=html.match(/const TABS=\[[\s\S]*?\r?\n\];/)[0],menu=html.match(/const MENU=\[[\s\S]*?\r?\n\];/)[0];
  vm.runInContext(`let AICOST_MONTH='2026-10',BILLING_EXPORT_DATA={};${tabs}${menu}${region(html,'menu-restructure')}${region(html,'marketing-expenses')}${region(html,'billing-monthly')}${fn('renderMarketingExpensePanel')}${fn('renderAicost')};this.api={renderAicost,renderMarketingExpensePanel,renderNav,visibleTabKeys,exportData:()=>BILLING_EXPORT_DATA};`,ctx);
  return {ctx,api:ctx.api,calls,writes,nav,nav2,tables};
}
test('manager navigation uses marketing label and switches off; owner AI label stays',()=>{
  const on=harness();on.api.renderNav();assert.ok(on.api.visibleTabKeys().has('aicost'));assert.match(on.nav.innerHTML,/📣 마케팅비/);assert.doesNotMatch(on.nav.innerHTML,/💰 AI비용|🔒 원장 전용/);
  const off=harness('manager','false');off.api.renderNav();assert.ok(!off.api.visibleTabKeys().has('aicost'));assert.doesNotMatch(off.nav.innerHTML,/📣 마케팅비/);
  const owner=harness('owner','false');owner.api.renderNav();assert.match(owner.nav2.innerHTML,/💰 AI비용/);
  assert.ok(!harness('staff').api.visibleTabKeys().has('aicost'));
});
test('manager opens real renderer with marketing only, no owner edits or private AI queries',async()=>{
  const h=harness(),m={innerHTML:''};await h.api.renderAicost(m);
  assert.match(m.innerHTML,/Marketing ad/);assert.match(m.innerHTML,/읽기 전용/);assert.match(m.innerHTML,/5,000/);
  assert.doesNotMatch(m.innerHTML,/Private|미분류|마케팅 아님|취소 검토|marketingOverride|marketingLink|marketingBudget|marketingRule|가맹점 기본 분류 수정|예산 저장|exportBillingExcel/);
  assert.ok(h.calls.every(t=>t==='app_settings'||t.startsWith('marketing_')));assert.deepEqual(h.writes,[]);
  assert.equal(h.api.exportData().marketing.rows.length,1);
});
test('off, malformed setting and settings errors stop manager data queries and clear cached exports',async()=>{
  for(const [value,error] of [['false',null],['junk',null],['',null],['true',{message:'failed'}]]){
    const h=harness('manager',value,error),m={innerHTML:''};await h.api.renderAicost(m);
    assert.match(m.innerHTML,/열람이 꺼져/);assert.deepEqual(h.calls,['app_settings']);assert.equal(h.api.exportData().marketing,undefined);
  }
});
test('missing preference defaults to on; staff calls no marketing queries',async()=>{
  const h=harness('manager',null);assert.match(await h.api.renderMarketingExpensePanel(),/Marketing ad/);
  const staff=harness('staff');assert.match(await staff.api.renderMarketingExpensePanel(),/원장 전용/);assert.deepEqual(staff.calls,[]);
});
test('a changed owner switch is reread even when the manager has a cached on preference',async()=>{
  const h=harness();assert.match(await h.api.renderMarketingExpensePanel(),/Marketing ad/);
  h.tables.app_settings.data.value='false';h.calls.length=0;
  assert.match(await h.api.renderMarketingExpensePanel(),/열람이 꺼져/);
  assert.deepEqual(h.calls,['app_settings']);assert.equal(h.api.exportData().marketing,undefined);
});
test('manager-only status and denial text honor owner text overrides and escape markup',async()=>{
  for(const [value,key,text] of [['true','mkt.manager_sub','Custom status <b>'],['false','mkt.view_unavailable','Custom off <b>']]){
    const h=harness('manager',value);
    await h.ctx.HubUi.load({from(){return {select(){return Promise.resolve({data:[{key,value:text}],error:null});}}}});
    const out=await h.api.renderMarketingExpensePanel();assert.ok(out.includes(text.replace('<','&lt;')));assert.ok(!out.includes(text));
  }
});
test('owner marketing renderer preserves private review rows and editing controls',async()=>{
  const h=harness('owner','false'),out=await h.api.renderMarketingExpensePanel();
  for(const text of ['Private excluded','Private unclassified','marketingBudget','marketingOverride','가맹점 기본 분류 수정','예산 저장'])assert.ok(out.includes(text),text);
  assert.ok(!h.calls.includes('app_settings'),'owner panel does not depend on manager switch');
});
test('hub switch is a boolean preference with default on, saved and reset through existing owner settings',async()=>{
  const c={};vm.createContext(c);vm.runInContext(hub.replace('root.hubSetting=hubSetting;','root.h={hubSettingDefByKey,hubSettingValidate,hubSettingSave,hubSettingReset,hubSettingSetValues,hubSettingBoolean,hubDrawSettingsSection};root.hubSetting=hubSetting;'),c);
  const h=c.h,d=h.hubSettingDefByKey('marketing.manager_view_enabled');assert.equal(d.def,'true');assert.equal(d.label,'마케팅비 매니저 보기');assert.equal(d.kind,'bool');
  assert.ok(!h.hubSettingValidate(d,'junk').ok);h.hubSettingSetValues({});assert.equal(h.hubSettingBoolean(d.key,true),true);
  const writes=[],sb={from(t){return {upsert(row){writes.push({t,row});return Promise.resolve({error:null});}}}};
  assert.ok((await h.hubSettingSave(sb,d.key,'false')).ok);assert.equal(h.hubSettingBoolean(d.key,true),false);
  assert.ok((await h.hubSettingReset(sb,d.key)).ok);assert.equal(h.hubSettingBoolean(d.key,false),true);
  assert.deepEqual(writes.map(w=>w.row.value),['false','true']);
  const sec={innerHTML:'',querySelectorAll:()=>[]};h.hubDrawSettingsSection(sec);assert.match(sec.innerHTML,/마케팅비 매니저 보기/);assert.match(sec.innerHTML,/<option value="true" selected>켬/);assert.match(sec.innerHTML,/<option value="false">끔/);
});

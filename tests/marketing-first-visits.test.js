const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('hr.html');
const region=name=>html.match(new RegExp('/\\* '+name+':test-start \\*/[\\s\\S]*?/\\* '+name+':test-end \\*/'))[0];
const panel=html.match(/async function renderMarketingExpensePanel\(\)\{[\s\S]*?\r?\n\}\r?\n/)[0];
const plain=value=>JSON.parse(JSON.stringify(value));
const ad={id:'ad',merchant:'합성 광고',merchant_key:'googleads',transaction_at:'2026-11-02T00:00:00Z',
  category_override:'google',parse_status:'recorded',event_kind:'purchase',currency:'KRW',amount_krw:10000,amount_native:10000};
const visits=(first_visit_count,path='all',month='2026-11-01')=>({month,path,first_visit_count});
const sets={marketing_expense_events:{data:[ad]},marketing_month_budgets:{data:{amount_krw:50000}},
  marketing_merchant_rules:{data:[]},marketing_foreign_charge_links:{data:[]}};

function boot(firstVisits,role='owner',managerView='true',marketingSets=sets){
  const queries=[];
  const ctx={ME:{role},hubT:(key,fallback,vars)=>ctx.hubText(key,fallback,vars),formatLeaveTimestamp:()=>'',
    aicostMoney:value=>Number(value).toLocaleString('ko-KR'),esc:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
    sb:{from(table){
      const q={table,columns:'',filters:[]};
      const result=()=>{
        queries.push(q);
        if(table==='dentweb_monthly_first_visits')return firstVisits(q);
        if(table==='app_settings')return {data:{key:'marketing.manager_view_enabled',value:managerView}};
        return marketingSets[table];
      };
      const api=new Proxy({}, {get(_,name){
        if(name==='then')return (resolve,reject)=>Promise.resolve().then(result).then(resolve,reject);
        if(name==='range'||name==='maybeSingle')return ()=>Promise.resolve().then(result);
        return (...args)=>{if(name==='select')q.columns=args[0];else q.filters.push([name,...args]);return api;};
      }});
      return api;
    }}
  };
  vm.createContext(ctx);
  vm.runInContext(read('hub-texts.js'),ctx);
  vm.runInContext("let AICOST_MONTH='2026-11',BILLING_EXPORT_DATA={};"+region('marketing-expenses')+region('billing-monthly')+panel,ctx);
  return {ctx,queries,setMonth:month=>vm.runInContext('AICOST_MONTH='+JSON.stringify(month),ctx)};
}

test('monthly visits prefer the all count and preserve measured zero separately from missing rows',()=>{
  const {ctx}=boot(()=>({data:[]}));
  const summary=(rows,spend=10000)=>plain(ctx.marketingFirstVisitSummary(rows,'2026-11',spend));
  assert.deepEqual(summary([visits(4),visits(3,'naver'),visits(2,'google'),visits(7,'all','2026-10-01')]),{count:4,costPerVisit:2500});
  assert.deepEqual(summary([visits(1,'naver'),visits(2,'google'),visits(7,'all','2026-10-01')]),{count:3,costPerVisit:3333});
  assert.deepEqual(summary([visits(0),visits(2,'google')]),{count:0,costPerVisit:null});
  assert.deepEqual(summary([visits(9,'all','2026-10-01')]),{count:null,costPerVisit:null});
  assert.deepEqual(summary([visits(4)],0),{count:4,costPerVisit:0});
});

test('live owner and enabled manager panels query just the selected month and show the cost below the budget',async()=>{
  for(const role of ['owner','manager']){
    const h=boot(()=>({data:[visits(4),visits(77,'all','2026-10-01')]}),role);
    const out=await h.ctx.renderMarketingExpensePanel();
    const query=h.queries.find(q=>q.table==='dentweb_monthly_first_visits');
    assert.deepEqual(query,{table:'dentweb_monthly_first_visits',columns:'month,path,first_visit_count',filters:[['eq','month','2026-11-01']]});
    assert.match(out,/합성 광고/);
    assert.match(out,/첫 내원 4명/);
    assert.match(out,/광고비 ÷ 첫 내원[\s\S]{0,90}₩2,500/);
    assert.ok(out.indexOf('광고비 ÷ 첫 내원')>out.indexOf('월 예산'));
  }
  for(const [role,switchValue] of [['manager','false'],['staff','true']]){
    const h=boot(()=>{throw new Error('unexpected request');},role,switchValue);
    await h.ctx.renderMarketingExpensePanel();
    assert.ok(h.queries.every(q=>q.table!=='dentweb_monthly_first_visits'));
  }
});

test('the visit ratio waits for unlinked foreign marketing charges and includes linked refunds',async()=>{
  const foreign={...ad,id:'foreign',currency:'USD',amount_native:50,amount_krw:null};
  const refund={...ad,id:'refund',event_kind:'cancellation',amount_native:-10000,amount_krw:-10000,
    merchant_key:'different',category_override:null,reversed_event_id:ad.id};
  const show=async(rows,links=[],role='owner')=>{
    const h=boot(()=>({data:[visits(4)]}),role,'true',{...sets,marketing_expense_events:{data:rows},
      marketing_foreign_charge_links:{data:links}});
    const out=await h.ctx.renderMarketingExpensePanel();
    return out.match(/<section id="marketingFirstVisits"[\s\S]*?<\/section>/)?.[0]||'';
  };
  for(const role of ['owner','manager']){
    const pending=await show([foreign],[],role);
    assert.match(pending,/첫 내원 4명[\s\S]*외화 광고비 원화 확인 필요/);
    assert.doesNotMatch(pending,/₩0/);
    assert.doesNotMatch(await show([ad,foreign],[],role),/₩2,500/);
    const links=[{foreign_event_id:foreign.id,krw_event_id:ad.id}];
    assert.match(await show([ad,foreign],links,role),/₩2,500/);
    const cancelled=await show([ad,foreign,refund],links,role);
    assert.match(cancelled,/₩0/);
    assert.doesNotMatch(cancelled,/외화 광고비 원화 확인 필요/);
    assert.match(await show([ad,{...foreign,category_override:'not_marketing'}],[],role),/₩2,500/);
  }
});

test('a refund inherits a KRW charge category from its linked foreign approval in owner and manager totals',async()=>{
  const foreign={...ad,id:'foreign-chain',currency:'USD',amount_native:50,amount_krw:null,category_override:'google'};
  const charge={...ad,id:'charge-chain',merchant_key:'unclassified-charge',category_override:null};
  const refund={...ad,id:'refund-chain',event_kind:'cancellation',amount_native:-10000,amount_krw:-10000,
    merchant_key:'unclassified-refund',category_override:null,reversed_event_id:charge.id};
  const rows=[foreign,charge,refund],links=[{foreign_event_id:foreign.id,krw_event_id:charge.id}];
  for(const role of ['owner','manager']){
    const h=boot(()=>({data:[visits(4)]}),role,'true',{...sets,marketing_expense_events:{data:rows},marketing_foreign_charge_links:{data:links}});
    const out=await h.ctx.renderMarketingExpensePanel();
    assert.equal(h.ctx.marketingEventCategoryFor(charge,[],rows,links),'google');
    assert.equal(h.ctx.marketingEventCategoryFor(refund,[],rows,links),'google');
    assert.deepEqual(plain(h.ctx.marketingMonthSummary(rows,[],links,'2026-11')),
      {totalKrw:0,channels:[['google',{amount:0,count:2,rows:[charge,refund]}]]});
    assert.match(out,/구글 · 2건[\s\S]{0,80}₩0/);
    const firstVisitSection=out.match(/<section id="marketingFirstVisits"[\s\S]*?<\/section>/)?.[0]||'';
    assert.match(firstVisitSection,/첫 내원 4명[\s\S]{0,180}₩0/);
    assert.doesNotMatch(firstVisitSection,/외화 광고비 원화 확인 필요/);
  }
});

test('a missing table or failed read retains ad spending and the zero count has its own explanation',async()=>{
  for(const requests of [()=>({data:null,error:{message:'missing table'}}),()=>{throw new Error('no network');},()=>({data:[]})]){
    const h=boot(requests);
    const out=await h.ctx.renderMarketingExpensePanel();
    assert.match(out,/합성 광고|₩10,000/);
    assert.match(out,/덴트웹 첫 내원 집계 확인 필요/);
    assert.doesNotMatch(out,/첫 내원 0명|마케팅비를 불러오지 못했습니다/);
  }
  const h=boot(()=>({data:[visits(0)]}));
  const out=await h.ctx.renderMarketingExpensePanel();
  assert.match(out,/첫 내원 0명[\s\S]*0명이라 계산할 수 없습니다/);
});

test('first-visit texts are managed by the existing owner text catalog and escaped',async()=>{
  const foreign={...ad,id:'foreign',currency:'USD',amount_native:50,amount_krw:null};
  const h=boot(()=>({data:[visits(4)]}),'owner','true',{...sets,marketing_expense_events:{data:[foreign]}});
  await h.ctx.HubUi.load({from(){return {select(){return Promise.resolve({data:[
    {key:'mkt.first_visits_count',value:'내원 수 <b>{n}</b>'},
    {key:'mkt.cost_per_first_visit',value:'광고 지표 <b>표시</b>'},
    {key:'mkt.first_visits_foreign_pending',value:'외화 <b>보류</b>'}
  ],error:null});}};}});
  const out=await h.ctx.renderMarketingExpensePanel();
  assert.match(out,/내원 수 &lt;b&gt;4&lt;\/b&gt;/);
  assert.match(out,/광고 지표 &lt;b&gt;표시&lt;\/b&gt;/);
  assert.match(out,/외화 &lt;b&gt;보류&lt;\/b&gt;/);
});

test('a slow monthly reply cannot overwrite a newer render after switching months and back',async()=>{
  let first,unblock,fetches=0;
  const started=new Promise(resolve=>{first=resolve;});
  const oldResponse=new Promise(resolve=>{unblock=resolve;});
  const h=boot(q=>{
    if(fetches++===0){first();return oldResponse;}
    const month=q.filters[0][2];
    return {data:[visits(month==='2026-11-01'?4:10,'all',month)]};
  });
  const previous=h.ctx.renderMarketingExpensePanel();
  await Promise.race([started,previous]);
  h.setMonth('2026-10');
  assert.match(await h.ctx.renderMarketingExpensePanel(),/첫 내원 10명/);
  h.setMonth('2026-11');
  assert.match(await h.ctx.renderMarketingExpensePanel(),/첫 내원 4명/);
  unblock({data:[visits(77)]});
  assert.equal(await previous,'');
});

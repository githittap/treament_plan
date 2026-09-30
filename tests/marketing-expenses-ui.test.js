const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('hr.html','utf8');
function helpers(){const block=html.match(/\/\* marketing-expenses:test-start \*\/[\s\S]*?\/\* marketing-expenses:test-end \*\//)?.[0];assert.ok(block,'마케팅비 집계 helper가 없습니다.');const context={Intl,Date,Number,String,Set,Map};vm.createContext(context);vm.runInContext(block+';this.h={marketingMonthAt,marketingCategoryFor,marketingEventCategoryFor,marketingMonthSummary,marketingKrwLinkCandidates,marketingForeignEvents};',context);return context.h;}

test('marketing category gives a single event override precedence and longest merchant rule precedence',()=>{
  const h=helpers(),rules=[{merchant_key:'google',category:'meta'},{merchant_key:'googleads',category:'google'}];
  assert.equal(h.marketingCategoryFor({merchant_key:'googleads'},rules),'google');
  assert.equal(h.marketingCategoryFor({merchant_key:'googleads',category_override:'not_marketing'},rules),'not_marketing');
});

test('monthly totals include only KRW channel events and linked foreign events are excluded',()=>{
  const h=helpers(),events=[
    {id:'a',parse_status:'recorded',transaction_at:'2026-10-01T00:00:00Z',currency:'KRW',amount_krw:300000,merchant_key:'당근페이'},
    {id:'b',parse_status:'recorded',transaction_at:'2026-10-01T00:00:00Z',currency:'INR',amount_native:129,merchant_key:'google'},
    {id:'c',parse_status:'recorded',transaction_at:'2026-10-01T00:00:00Z',currency:'KRW',amount_krw:1200,merchant_key:'googleads'},
    {id:'d',parse_status:'recorded',transaction_at:'2026-09-30T00:00:00Z',currency:'KRW',amount_krw:500,merchant_key:'당근'},
  ];
  const summary=h.marketingMonthSummary(events,[{merchant_key:'당근',category:'daangn'},{merchant_key:'google',category:'google'},{merchant_key:'googleads',category:'google'},{merchant_key:'youtube',category:'not_marketing'}],[{foreign_event_id:'b',krw_event_id:'c'}],'2026-10');
  assert.equal(summary.totalKrw,301200);assert.deepEqual(JSON.parse(JSON.stringify(summary.channels)),[['daangn',{amount:300000,count:1,rows:[events[0]]}],['google',{amount:1200,count:1,rows:[events[2]]}]]);
});

test('foreign charge candidates include KRW purchases from another month',()=>{
  const h=helpers(),events=[
    {id:'sep-krw',parse_status:'recorded',event_kind:'purchase',transaction_at:'2026-09-30T15:00:00Z',currency:'KRW',amount_krw:12900},
    {id:'oct-foreign',parse_status:'recorded',event_kind:'purchase',transaction_at:'2026-10-01T01:00:00Z',currency:'INR',amount_native:129},
    {id:'failed-krw',parse_status:'failed',event_kind:'purchase',currency:'KRW',amount_krw:null},
    {id:'reversal-krw',parse_status:'recorded',event_kind:'cancellation',currency:'KRW',amount_krw:-12900},
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(h.marketingKrwLinkCandidates(events).map(row=>row.id))),['sep-krw']);
  const markup=html.match(/async function renderMarketingExpensePanel\(\){[\s\S]*?\n\}\n/)?.[0];
  assert.match(markup,/marketingKrwLinkCandidates\(all\)/,'link options must use all fetched months');
});

test('matched cancellations keep the monthly net at zero and render as refunds',()=>{
  const h=helpers(),purchase={id:'purchase',event_kind:'purchase',parse_status:'recorded',transaction_at:'2026-10-01T00:00:00Z',currency:'KRW',amount_krw:1000,merchant_key:'google'},cancellation={...purchase,id:'cancel',event_kind:'cancellation',amount_krw:-1000};
  const summary=h.marketingMonthSummary([purchase,cancellation],[{merchant_key:'google',category:'google'}],[],'2026-10');
  assert.equal(summary.totalKrw,0);assert.equal(summary.channels[0][1].amount,0);assert.equal(summary.channels[0][1].count,2);
  assert.match(html,/row\.event_kind==='cancellation'\?' · 취소'/,'cancellation rows should be identifiable');
  assert.match(html,/value\.amount\|\|!value\.rows\.some\(row=>row\.currency!=='KRW'\)/,'zero domestic net must render as ₩0');
});

test('cancellation classification follows its individually classified approval',()=>{
  const h=helpers(),purchase={id:'purchase',event_kind:'purchase',parse_status:'recorded',transaction_at:'2026-10-01T00:00:00Z',currency:'KRW',amount_krw:1000,merchant_key:'unknown',category_override:'google'},cancellation={...purchase,id:'cancel',event_kind:'cancellation',amount_krw:-1000,merchant_key:'other',category_override:'meta',reversed_event_id:'purchase'};
  const summary=h.marketingMonthSummary([purchase,cancellation],[],[],'2026-10');
  assert.equal(summary.totalKrw,0);assert.deepEqual(JSON.parse(JSON.stringify(summary.channels.map(([key,value])=>[key,value.count]))),[['google',2]]);
  assert.equal(h.marketingEventCategoryFor(cancellation,[],[purchase,cancellation],[]),'google');
});

test('linked KRW charge inherits foreign approval category and linked foreign row remains manageable',()=>{
  const h=helpers(),foreign={id:'foreign',event_kind:'purchase',parse_status:'recorded',transaction_at:'2026-09-30T15:00:00Z',currency:'INR',amount_native:129,merchant_key:'google',category_override:'google'},charge={id:'charge',event_kind:'purchase',parse_status:'recorded',transaction_at:'2026-10-01T01:00:00Z',currency:'KRW',amount_krw:12900,merchant_key:'unknown'},links=[{foreign_event_id:'foreign',krw_event_id:'charge'}],events=[foreign,charge];
  const summary=h.marketingMonthSummary(events,[],links,'2026-10');
  assert.equal(summary.totalKrw,12900);assert.deepEqual(JSON.parse(JSON.stringify(summary.channels.map(([key,value])=>[key,value.amount,value.rows.map(row=>row.id)]))),[['google',12900,['charge']]]);
  assert.deepEqual(JSON.parse(JSON.stringify(h.marketingForeignEvents(events,[],links).map(row=>row.id))),['foreign']);
  const markup=html.match(/async function renderMarketingExpensePanel\(\)\{[\s\S]*?\n\}\n/)?.[0];
  assert.match(markup,/marketingForeignEvents\(recorded,rules,links\)/,'linked foreign approvals must remain visible for link edits');
});

test('marketing panel has month, budget, channel details, foreign and exclusions, and no raw SMS selection',()=>{
  const body=html.match(/async function renderMarketingExpensePanel\(\)\{[\s\S]*?\n\}\n/)?.[0];assert.ok(body,'마케팅비 화면 함수를 찾지 못했습니다.');
  for(const marker of ['월 예산','미분류','마케팅 아님','외화','취소 검토','가맹점 기본 분류 수정','지난달 내역에도 반영됨','marketing_expense_events'])assert.ok(body.includes(marker),`화면에 ${marker}가 있어야 합니다.`);
  assert.ok(!body.includes('select(\'*\')')&&!body.includes('raw_text'),'마케팅 화면은 승인 원문을 읽지 않아야 합니다.');
});

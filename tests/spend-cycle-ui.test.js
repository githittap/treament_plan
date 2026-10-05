const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('hr.html','utf8'),hub=fs.readFileSync('hub-texts.js','utf8');
const region=name=>html.match(new RegExp('/\\* '+name+':test-start \\*/[\\s\\S]*?/\\* '+name+':test-end \\*/'))[0];
function harness(settings={}){
 const c={today:()=> '2026-10-05',hubN:(k,d)=>c.hubSettingChecked(k,d),hubT:(k,d,v)=>c.hubText(k,d,v),render(){c.rendered=true;}};
 vm.createContext(c);vm.runInContext(hub.replace('root.hubText=hubText;','root.spendTestDefs={texts:hubTextDefs,settings:HUB_SETTING_DEFS,lists:HUB_LIST_DEFS,settingSave:hubSettingSave,listSave:hubListSave,move:hubMoveListItem,items:hubListItemsFor};root.hubText=hubText;'),c);c.HubUi.setSettings(settings);
 vm.runInContext(region('marketing-expenses')+region('aicost-platform'),c);
 vm.runInContext(fs.readFileSync('spend-cycle.js','utf8'),c);vm.runInContext(fs.readFileSync('spend-cycle-ui.js','utf8'),c);return c;
}
const row=(id,amount,extra={})=>({id,parse_status:'recorded',event_kind:'purchase',transaction_at:'2026-10-03T02:00:00Z',currency:'KRW',amount_krw:amount,merchant:'Google Ads',merchant_key:'google',raw_text:'SECRET SMS 1234567890123456',...extra});
test('실제 화면에 두 구역을 삽입하고 캐시 번호를 올린다',()=>{
 assert.match(html,/spend-cycle\.js\?v=2026100510/);assert.match(html,/spend-cycle-ui\.js\?v=2026100510/);assert.match(html,/SpendUi\.marketing\(all,rules,links\)/);assert.match(html,/SpendUi\.loadAi\(sb,billingFetchAll\)/);assert.match(html,/SpendUi\.ai\(spendData\)/);
});
test('분류·연결·취소 기준을 재사용하며 문자 원문은 화면에 들어가지 않는다',()=>{
 const c=harness(),rows=[row('a',1000),row('b',7000,{category_override:'not_marketing'}),row('c',9000,{parse_status:'failed'}),row('foreign',0,{currency:'USD'}),row('krw',500),row('cancel',-100,{event_kind:'cancellation',reversed_event_id:'a'})],rules=[{merchant_key:'google',category:'google'}],links=[{foreign_event_id:'foreign',krw_event_id:'krw'}];
 const out=c.SpendUi.marketing(rows,rules,links);assert.match(out,/data-spend-scope="marketing"/);assert.match(out,/₩1,400/);assert.match(out,/3건/);assert.doesNotMatch(out,/SECRET|1234567890123456|raw_text/);assert.match(out,/외화 0건/);
 const old=c.marketingMonthSummary(rows,rules,links,'2026-10');assert.equal(old.totalKrw,1400);
});
test('켜기·끄기, 문구, 숫자 기준, 기간 이름·순서가 허브 설정에서 바뀐다',async()=>{
 const off=harness({'spend.enabled_marketing':'false','spend.enabled_ai':'false'});assert.equal(off.SpendUi.marketing([],[],[]),'');assert.equal(await off.SpendUi.loadAi(null,null),null);assert.equal(off.SpendUi.ai({}), '');
 const c=harness({'spend.default_days':'7','spend.week_start':'0','spend.top_merchants':'1','spend.change_alert_pct':'5','list.spend_periods':JSON.stringify([{code:'custom',label:'고른 기간'},{code:'today',label:'금일'},{code:'this_month',label:'금월'},{code:'this_week',label:'금주'},{code:'last_n_days',label:'최근'}])});
 assert.equal(c.SpendUi.options('marketing').days,7);assert.equal(c.SpendUi.options('marketing').weekStart,0);assert.equal(c.SpendUi.periods()[0].code,'custom');
 await c.HubUi.load({from(){return {select(){return Promise.resolve({data:[{key:'spend.title',value:'변경한 제목 <b>'}],error:null});}}}});
 const out=c.SpendUi.marketing([row('a',1000),row('b',500,{merchant:'Second'})],[{merchant_key:'google',category:'google'}],[]);assert.match(out,/변경한 제목 &lt;b&gt;/);assert.match(out,/그 외/);assert.match(out,/금일/);
 c.SpendUi.change('marketing','preset','custom');assert.equal(c.rendered,true);assert.match(c.SpendUi.marketing([],[],[]),/type="date"/);
});
test('AI 분석 조회는 선택 기간·이전 기간·기준선을 읽고 원문과 메모는 select하지 않는다',async()=>{
 const c=harness(),calls=[];const db={from(table){const q={select(s){calls.push({table,select:s,filters:[]});return q;},gte(k,v){calls.at(-1).filters.push(['gte',k,v]);return q;},lte(k,v){calls.at(-1).filters.push(['lte',k,v]);return q;},or(s){calls.at(-1).periods=s;return q;},order(){return q;},then(resolve){resolve({data:[],error:null});}};return q;}};
 const data=await c.SpendUi.loadAi(db,make=>make());assert.equal(calls.length,2);for(const x of calls)assert.doesNotMatch(x.select,/raw_text|note/);assert.deepEqual(calls[1].filters,[['gte','usage_date','2026-07-12'],['lte','usage_date','2026-10-05']]);assert.equal(data.tokensError,false);
 c.SpendUi.change('ai','preset','this_month');calls.length=0;await c.SpendUi.loadAi(db,make=>make());assert.deepEqual(calls[1].filters,[['gte','usage_date','2026-08-06'],['lte','usage_date','2026-10-05']]);
});
test('AI는 광고 제외·직접 입력 제외·토큰 간격 숨김·오류별 표시를 한다',()=>{
 const c=harness(),data={money:[{platform:'Claude',received_at:'2026-10-03T00:00:00Z',amount_krw:1000},{platform:'naver_ads',received_at:'2026-10-03T00:00:00Z',amount_krw:9000}],tokens:[{usage_date:'2026-10-03',model:'Sol',tokens:800000}],moneyError:false,tokensError:false};
 const out=c.SpendUi.ai(data);assert.match(out,/₩1,000/);assert.doesNotMatch(out,/₩9,000/);assert.match(out,/직접 입력 월 합계는/);const tok=out.split('data-spend-unit="tokens"')[1];assert.ok(tok);assert.doesNotMatch(tok,/결제 간격/);assert.match(tok,/100만 토큰/);
 assert.match(c.SpendUi.ai({...data,moneyError:true}),/불러오지 못했습니다/);
});
test('모든 화면 글과 설정 기준은 허브 설정 목록에 등록된다',()=>{
 const c=harness(),defs=c.spendTestDefs.texts();
 for(const key of Object.keys(c.SpendUi.TEXTS))assert.ok(defs.some(x=>x.key==='spend.'+key),key);
 for(const key of ['default_days','week_start','top_merchants','change_alert_pct','enabled_marketing','enabled_ai'])assert.ok(c.spendTestDefs.settings.some(x=>x.key==='spend.'+key),key);
 assert.ok(c.spendTestDefs.lists.some(x=>x.key==='list.spend_periods'&&x.orderable));assert.match(hub,/data-hub-list-move/);
});
test('설정 저장은 기존 DB upsert로 실행되며 기간 순서 변경은 이름을 보존한다',async()=>{
 const c=harness(),h=c.spendTestDefs,writes=[],db={from(table){return {upsert(row){writes.push({table,...row});return Promise.resolve({error:null});}};}};
 for(const [key,value] of [['default_days','14'],['week_start','0'],['top_merchants','2'],['change_alert_pct','20'],['enabled_marketing','false'],['enabled_ai','false']])assert.equal((await h.settingSave(db,'spend.'+key,value)).ok,true);
 assert.equal(c.SpendUi.options('marketing').days,14);assert.equal(c.SpendUi.marketing([],[],[]),'');
 const count=writes.length;assert.equal((await h.settingSave(db,'spend.week_start','8')).ok,false);assert.equal(writes.length,count);
 const index=h.lists.findIndex(x=>x.key==='list.spend_periods'),def=h.lists[index],sec={innerHTML:'',querySelector(selector){return {value:selector.endsWith('_0')?'금일':def.def[Number(selector.split('_').at(-1))].label};},querySelectorAll(){return [];}};
 h.move(sec,index,0,1);const draft=h.items(def);assert.equal(draft[1].code,'today');assert.equal(draft[1].label,'금일');assert.match(sec.innerHTML,/data-hub-list-move/);
 assert.equal((await h.listSave(db,'list.spend_periods',draft)).ok,true);assert.equal(c.SpendUi.periods()[1].label,'금일');assert.ok(writes.every(x=>x.table==='app_settings'));
});

test('손질 10-05: 토큰 억 단위 · 지난 기간 기록 없음 · 잘린 상호는 가맹점 규칙 이름',()=>{
 const c=harness();
 assert.equal(c.SpendUi.format(11011500000000/1000,true),'110.1억 토큰');
 assert.equal(c.SpendUi.format(4500000,true),'450만 토큰');
 assert.equal(c.SpendUi.format(100000,true),'50만 토큰 미만');
 const rules=[{merchant_key:'카카',merchant_label:'카카오',category:'kakao'},{merchant_key:'카카오',merchant_label:'카카오',category:'kakao'}];
 assert.equal(c.SpendUi.merchantLabel({merchant:'주식회사카카',merchant_key:'주식회사카카'},rules),'카카오');
 assert.equal(c.SpendUi.merchantLabel({merchant:'쿠팡',merchant_key:'쿠팡'},rules),'쿠팡');
 const ev=[{id:'k1',parse_status:'recorded',event_kind:'purchase',transaction_at:'2026-10-03T02:00:00Z',currency:'KRW',amount_krw:39540,merchant:'주식회사카카',merchant_key:'주식회사카카'}];
 const out=c.SpendUi.marketing(ev,rules,[]);
 assert.match(out,/카카오 · 1건/);assert.doesNotMatch(out,/주식회사카카/);
 assert.match(out,/지난 기간 기록 없음/);assert.doesNotMatch(out,/비교 불가/);assert.doesNotMatch(out,/지난 기간 대비 지난 기간/);
});

const anomalyDay=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function chartRows(mode='normal'){
 const out=[];for(let i=0;i<56;i+=(mode==='short'?4:1))out.push(row('base'+i,100,{transaction_at:anomalyDay('2026-08-04',i)+'T12:00:00+09:00'}));
 for(let i=0;i<7;i++)out.push(row('recent'+i,mode==='excess'?300:100,{transaction_at:anomalyDay('2026-09-29',i)+'T12:00:00+09:00'}));
 return mode==='insufficient'?out.filter(x=>x.id.startsWith('recent')||['base0','base1','base2','base3'].includes(x.id)):out;
}
test('그래프: 날짜별 SVG·평소 범위 띠·평균선·간격 점선과 날짜 금액 title이 나온다',()=>{
 const c=harness({'spend.default_days':'7'}),out=c.SpendUi.marketing(chartRows(),[{merchant_key:'google',category:'google'}],[]);
 assert.match(out,/<svg[^>]+data-spend-chart="daily"/);assert.match(out,/spend-baseline-band/);assert.match(out,/spend-baseline-mean/);assert.match(out,/data-spend-chart="interval"/);assert.match(out,/stroke-dasharray/);assert.match(out,/<title>2026-10-05 · ₩100<\/title>/);assert.match(out,/viewBox=/);assert.match(out,/width:100%/);assert.match(out,/🟢 평소 범위 안/);
});
test('그래프: 과다·단축·정상·부족 네 상태와 빨간 막대·점이 나온다',()=>{
 const c=harness({'spend.default_days':'7'}),rules=[{merchant_key:'google',category:'google'}];
 const excess=c.SpendUi.marketing(chartRows('excess'),rules,[]);assert.match(excess,/data-spend-anomaly="excess"/);assert.match(excess,/spend-spike/);assert.match(excess,/최근 7일 ₩2,100/);assert.match(excess,/평소 7일 평균 ₩700보다 \+200.0%/);
 const short=c.SpendUi.marketing(chartRows('short'),rules,[]);assert.match(short,/data-spend-anomaly="interval"/);assert.match(short,/결제 간격이 평소 4일 → 최근 1일/);assert.match(short,/spend-short/);
 const insufficient=c.SpendUi.marketing(chartRows('insufficient'),rules,[]);assert.match(insufficient,/data-spend-anomaly="insufficient"/);assert.match(insufficient,/아직 비교할 평소 자료가 부족함\(4건\)/);assert.doesNotMatch(insufficient,/spend-spike|data-spend-anomaly="normal"|spend-baseline-band/);
 assert.doesNotMatch(excess,/SECRET|raw_text|\d{16}/);
});
test('그래프: 60일 초과는 주별 막대이고 끔이면 모든 SVG를 숨긴다',()=>{
 const c=harness({'spend.default_days':'61'}),out=c.SpendUi.marketing(chartRows(),[{merchant_key:'google',category:'google'}],[]);assert.match(out,/data-spend-bucket="week"/);assert.ok((out.match(/class="spend-bar/g)||[]).length<=10);
 const off=harness({'spend.default_days':'7','spend.chart_enabled':'false'}),disabled=off.SpendUi.marketing(chartRows(),[{merchant_key:'google',category:'google'}],[]);assert.doesNotMatch(disabled,/<svg/);assert.match(disabled,/data-spend-anomaly="normal"/);
});
test('그래프: AI 돈·토큰에 각각 막대가 나오고 토큰에는 간격이 없다',()=>{
 const c=harness({'spend.default_days':'7'}),rows=chartRows('excess'),out=c.SpendUi.ai({money:rows.map(x=>({platform:'Claude',received_at:x.transaction_at,amount_krw:x.amount_krw})),tokens:rows.map(x=>({usage_date:x.transaction_at.slice(0,10),model:'Sol',tokens:x.amount_krw*10000})),moneyError:false,tokensError:false});
 assert.equal((out.match(/data-spend-chart="daily"/g)||[]).length,2);assert.equal((out.match(/data-spend-chart="interval"/g)||[]).length,1);assert.doesNotMatch(out.split('data-spend-unit="tokens"')[1],/결제 간격|data-spend-chart="interval"/);assert.match(out,/2,100만 토큰/);
});
test('그래프: 숫자 설정 6개·켬 설정은 등록되고 소수 기준과 문구를 DB 방식으로 바꾼다',async()=>{
 const c=harness({'spend.default_days':'7'}),writes=[],db={from(table){return {upsert(row){writes.push({table,...row});return Promise.resolve({error:null});}};}};
 for(const [key,value] of [['baseline_weeks','2'],['z_threshold','2.5'],['excess_pct','500'],['shrink_pct','80'],['recent_payments','3'],['min_baseline_events','4'],['chart_enabled','false']]){assert.ok(c.spendTestDefs.settings.some(x=>x.key==='spend.'+key),key);assert.equal((await c.spendTestDefs.settingSave(db,'spend.'+key,value)).ok,true,key);}
 assert.equal(c.SpendUi.options('marketing').z_threshold,2.5);const out=c.SpendUi.marketing(chartRows('excess'),[{merchant_key:'google',category:'google'}],[]);assert.match(out,/data-spend-anomaly="normal"/);assert.doesNotMatch(out,/<svg/);assert.ok(writes.every(x=>x.table==='app_settings'));
 await c.HubUi.load({from(){return {select(){return Promise.resolve({data:[{key:'spend.anomaly_normal',value:'기준 안 <b>'}],error:null});}}}});assert.match(c.SpendUi.marketing(chartRows(),[{merchant_key:'google',category:'google'}],[]),/기준 안 &lt;b&gt;/);
});
test('그래프: 기존 월 합계·예산·기간 숫자를 보존하고 경고에도 원문은 없다',()=>{
 const c=harness({'spend.default_days':'7'}),rows=chartRows('excess'),rules=[{merchant_key:'google',category:'google'}],before=JSON.stringify(c.marketingMonthSummary(rows,rules,[],'2026-10')),out=c.SpendUi.marketing(rows,rules,[]);assert.equal(JSON.stringify(c.marketingMonthSummary(rows,rules,[],'2026-10')),before);assert.match(out,/하루 평균 ₩300/);assert.match(out,/₩2,100/);assert.doesNotMatch(out,/SECRET|raw_text|\d{16}/);
});

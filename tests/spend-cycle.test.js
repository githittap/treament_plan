const test=require('node:test'),assert=require('node:assert/strict');
const {calculate,window:period}=require('../spend-cycle.js');
const at=(day,amount=100,kind='purchase',key='google')=>({at:day+'T12:00:00+09:00',amount,kind,key,label:key});
const opts={now:'2026-10-05T12:00:00+09:00',preset:'this_month'};
test('한국 자정은 UTC 15시이며 미래 결제는 제외한다',()=>{
 const s=calculate([{at:'2026-10-04T14:59:59Z',amount:99},{at:'2026-10-04T15:00:00Z',amount:200},{at:'2026-10-05T15:00:00Z',amount:999}],{...opts,preset:'today'});
 assert.equal(s.total,200);assert.equal(s.start,'2026-10-05');assert.equal(s.end,s.start);assert.equal(s.prev.total,99);
});
test('주 시작 설정이 월요일과 일요일 경계를 바꾼다',()=>{
 assert.equal(period({...opts,preset:'this_week'}).start,'2026-10-05');
 assert.equal(period({...opts,preset:'this_week',weekStart:0}).start,'2026-10-04');
});
test('지난달은 같은 경과일, 3월31일이면 윤년 2월 말일까지다',()=>{
 const s=calculate([at('2026-09-05',300),at('2026-09-06',900),at('2026-10-05',600)],opts);
 assert.equal(s.prev.start,'2026-09-01');assert.equal(s.prev.end,'2026-09-05');assert.equal(s.prev.total,300);assert.equal(s.prev.diff,300);assert.equal(s.prev.pct,100);
 assert.equal(period({now:'2024-03-31',preset:'this_month'}).prevEnd,'2024-02-29');
 assert.equal(period({now:'2025-03-31',preset:'this_month'}).prevEnd,'2025-02-28');
});
test('빈 자료와 한 건은 간격이 없고 지난 기간 0원은 비교 불가다',()=>{
 const empty=calculate([],opts);assert.equal(empty.total,0);assert.equal(empty.day.avg,0);assert.equal(empty.interval,null);assert.equal(empty.prev.pct,null);assert.equal(empty.byKey.length,0);
 assert.equal(calculate([at('2026-10-01')],opts).interval,null);
});
test('취소는 합계에 음수 반영하되 결제 간격에는 넣지 않는다',()=>{
 const s=calculate([at('2026-10-01',100),at('2026-10-02',-20,'cancellation'),at('2026-10-04',200)],opts);
 assert.equal(s.total,280);assert.equal(s.count,3);assert.equal(s.purchaseCount,2);assert.equal(s.interval.avgDays,3);assert.equal(s.interval.minDays,3);assert.equal(s.interval.lastAt,'2026-10-04T12:00:00+09:00');assert.equal(s.days,5);assert.equal(s.day.avg,56);assert.equal(s.day.max,200);assert.equal(s.day.maxDate,'2026-10-04');
});
test('걸친 주와 월도 각각 한 단위로 세며 결제 없는 날도 최대 비교에 포함한다',()=>{
 const s=calculate([at('2026-09-30',100),at('2026-10-05',200)],{...opts,preset:'custom',from:'2026-09-30',to:'2026-10-05'});
 assert.equal(s.week.avg,150);assert.equal(s.month.avg,150);assert.equal(s.week.max,200);assert.equal(s.month.maxMonth,'2026-10');
 const negative=calculate([at('2026-10-01',-20,'cancellation')],opts);assert.equal(negative.day.max,0);assert.equal(negative.day.maxDate,'2026-10-02');
});
test('N일과 직접 기간은 바로 앞 같은 길이와 비교하고 미래 날짜를 자른다',()=>{
 const a=period({...opts,preset:'last_n_days',days:3});assert.equal(a.start,'2026-10-03');assert.equal(a.prevStart,'2026-09-30');assert.equal(a.prevEnd,'2026-10-02');
 assert.equal(period({...opts,preset:'last_n_days',days:10}).start,'2026-09-26');
 const c=period({...opts,preset:'custom',from:'2026-10-03',to:'2026-10-30'});assert.equal(c.end,'2026-10-05');assert.equal(c.days,3);assert.equal(c.prevStart,'2026-09-30');
});
test('토큰 usage 행은 간격을 만들지 않고 키별 합계 비중은 순서대로다',()=>{
 const s=calculate([at('2026-10-01',300,'usage','Sol'),at('2026-10-02',100,'usage','Luna')],opts);
 assert.equal(s.interval,null);assert.equal(s.purchaseCount,0);assert.deepEqual(s.byKey.map(x=>[x.key,x.amount,x.share]),[['Sol',300,75],['Luna',100,25]]);
});
test('이번 주 비교는 지난 주 같은 경과일까지다',()=>{
 const p=period({...opts,now:'2026-10-07',preset:'this_week'});assert.equal(p.start,'2026-10-05');assert.equal(p.prevStart,'2026-09-28');assert.equal(p.prevEnd,'2026-09-30');
});
test('잘못된 날짜는 거절하고 미래 직접 기간과 거꾸로 기간은 오늘 안으로 정리한다',()=>{
 assert.throws(()=>period({...opts,preset:'custom',from:'2026-02-30',to:'2026-10-05'}),/date/);
 assert.equal(period({...opts,preset:'custom',from:'2026-11-01',to:'2026-11-30'}).start,'2026-10-05');
 assert.equal(period({...opts,preset:'custom',from:'2026-10-05',to:'2026-10-01'}).start,'2026-10-01');
});

const {anomaly}=require('../spend-cycle.js');
const anomalyOpts={now:'2026-10-05',preset:'last_n_days',days:7};
const shiftDay=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function anomalyRows(recent=100,variable=false){
 const rows=[];for(let i=0;i<56;i++)rows.push(at(shiftDay('2026-08-04',i),variable?(100+Math.floor(i/7)*10):100));
 for(let i=0;i<7;i++)rows.push(at(shiftDay('2026-09-29',i),recent));return rows;
}
test('이상: 평소 일정하면 과다·튀는 날·간격 단축이 없다',()=>{
 const a=anomaly(anomalyRows(),anomalyOpts);assert.equal(a.insufficient,false);assert.equal(a.excess.flag,false);assert.equal(a.interval.flag,false);assert.equal(a.spikes.length,0);assert.equal(a.baseline.weekAvg,700);assert.equal(a.baseline.dayAvg,100);
});
test('이상: 최근 7일 3배는 z와 % 양쪽 기준을 넘는다',()=>{
 const a=anomaly(anomalyRows(400,true),anomalyOpts);assert.ok(a.excess.z>=2);assert.ok(a.excess.pct>=50);assert.equal(a.excess.flag,true);assert.equal(a.excess.recent7,2800);assert.equal(a.spikes.length,7);
});
test('이상: 표준편차 0이면 z는 없고 % 기준만 사용한다',()=>{
 const rows=anomalyRows(300),a=anomaly(rows,anomalyOpts);assert.equal(a.baseline.weekSd,0);assert.equal(a.excess.z,null);assert.equal(a.excess.pct,200);assert.equal(a.excess.flag,true);assert.equal(anomaly(rows,{...anomalyOpts,excess_pct:201}).excess.flag,false);
});
test('이상: 튀는 날은 날짜별로 합산하고 미래·잘못된 날짜를 제외한다',()=>{
 const rows=anomalyRows();rows.push(at('2026-10-01',50),at('2026-10-01',100),at('2026-10-06',9999),{at:'wrong',amount:9999});
 assert.deepEqual(anomaly(rows,anomalyOpts).spikes,[{date:'2026-10-01',amount:250}]);
});
test('이상: 결제 간격 4일에서 1일은 75% 짧아짐이다',()=>{
 const rows=[];for(let i=0;i<56;i+=4)rows.push(at(shiftDay('2026-08-04',i)));
 for(let i=0;i<5;i++)rows.push(at(shiftDay('2026-10-01',i)));
 const a=anomaly(rows,anomalyOpts);assert.equal(a.interval.baselineAvg,4);assert.equal(a.interval.recentAvg,1);assert.equal(a.interval.pct,75);assert.equal(a.interval.flag,true);assert.equal(anomaly(rows,{...anomalyOpts,shrink_pct:76}).interval.flag,false);
});
test('이상: 기준선 결제 4건은 부족하며 어떤 경고도 판정하지 않는다',()=>{
 const rows=[0,4,8,12].map(i=>at(shiftDay('2026-08-04',i)));rows.push(at('2026-10-05',99999));
 const a=anomaly(rows,anomalyOpts);assert.equal(a.insufficient,true);assert.equal(a.baseline.events,4);assert.equal(a.excess.flag,false);assert.equal(a.interval.flag,false);assert.deepEqual(a.spikes,[]);assert.equal(anomaly(rows,{...anomalyOpts,min_baseline_events:4}).insufficient,false);
});
test('이상: 취소·토큰은 결제 간격에서 제외하고 토큰 자체의 금액 분포는 비교한다',()=>{
 const rows=anomalyRows();rows.push(at('2026-10-03',-50,'cancellation'),at('2026-10-04',800,'usage'));
 const a=anomaly(rows,anomalyOpts);assert.equal(a.interval.recentAvg,1);assert.equal(a.interval.baselineAvg,1);
 const tok=anomaly(anomalyRows(300).map(x=>({...x,kind:'usage'})),anomalyOpts);assert.equal(tok.excess.flag,true);assert.equal(tok.interval.recentAvg,null);assert.equal(tok.interval.flag,false);
});
test('이상: 기준선은 바로 앞 8주이며 주 합계 덩어리와 선택 기간이 겹치지 않는다',()=>{
 const a=anomaly(anomalyRows(10000),anomalyOpts);assert.equal(a.baseline.start,'2026-08-04');assert.equal(a.baseline.end,'2026-09-28');assert.equal(a.baseline.events,56);assert.equal(a.baseline.weekAvg,700);
 const short=anomaly(anomalyRows(10000),{...anomalyOpts,baseline_weeks:2});assert.equal(short.baseline.start,'2026-09-15');assert.equal(short.baseline.events,14);
});
test('이상: 최근 건수 설정과 임계치 소수 변경은 실제 판정을 바꾼다',()=>{
 const rows=anomalyRows(150,true),low=anomaly(rows,{...anomalyOpts,z_threshold:0.5,excess_pct:999}),high=anomaly(rows,{...anomalyOpts,z_threshold:10,excess_pct:999});assert.equal(low.excess.flag,true);assert.equal(high.excess.flag,false);
 const spaced=[];for(let i=0;i<56;i+=4)spaced.push(at(shiftDay('2026-08-04',i)));for(const d of ['2026-09-29','2026-09-30','2026-10-04','2026-10-05'])spaced.push(at(d));
 assert.equal(anomaly(spaced,{...anomalyOpts,recent_payments:2}).interval.recentAvg,1);assert.equal(anomaly(spaced,{...anomalyOpts,recent_payments:4}).interval.recentAvg,2);
});
test('이상: 기존 기간·주기 계산은 호출 전후 완전히 같고 입력을 수정하지 않는다',()=>{
 const rows=anomalyRows(),copy=JSON.stringify(rows),before=calculate(rows,anomalyOpts);anomaly(rows,anomalyOpts);assert.deepEqual(calculate(rows,anomalyOpts),before);assert.equal(JSON.stringify(rows),copy);
});
test('이상: 기준선 0원과 같은 시각 결제는 NaN·Infinity로 경고하지 않는다',()=>{
 const rows=[];for(let i=0;i<5;i++)rows.push(at('2026-09-01',0));rows.push(at('2026-10-05',100));const a=anomaly(rows,anomalyOpts);assert.equal(a.excess.z,null);assert.equal(a.excess.pct,null);assert.equal(a.interval.flag,false);assert.doesNotMatch(JSON.stringify(a),/NaN|Infinity/);
});

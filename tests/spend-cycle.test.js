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

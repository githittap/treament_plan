const test=require('node:test'),assert=require('node:assert/strict');
const cycle=require('../spend-cycle.js');
test('만원: 경계값·음수·원 설정은 버림과 정확한 단위를 지킨다',()=>{
 for(const [n,want] of [[0,'0원'],[9999,'9,999원'],[10000,'1만원'],[19999,'1만원'],[2853834,'285만원'],[12345678,'1,234만원'],[-19999,'−1만원'],[-8500,'−8,500원']])assert.equal(cycle.spendMan(n),want);
 assert.equal(cycle.spendMan(2853834,'won'),'2,853,834원');
});

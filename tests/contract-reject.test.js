const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'hr.html'), 'utf8');

test('반려 함수는 원장의 발송요청만 반려하고 상태 조건으로 update를 제한한다', () => {
  const match = html.match(/async function rejectContractSend\(id\)\{([\s\S]*?)\n\}/);
  assert.ok(match, '반려 함수가 있어야 한다.');
  const body = match[1];
  assert.match(body, /ME\.role!=='owner'/);
  assert.match(body, /row\.status!=='발송요청'/);
  assert.match(body, /이 발송 요청을 반려할까요\? 직원에게 가지 않고 취소로 바뀝니다/);
  assert.match(body, /status:'취소',reviewed_by:ME\.name,reviewed_at:new Date\(\)\.toISOString\(\)/);
  assert.match(body, /\.eq\('id',row\.id\)\.eq\('status','발송요청'\)\.select\('id'\)/);
  assert.match(body, /이미 처리된 요청입니다/);
  assert.match(html, /ME\.role==='owner'\?`<div class="card"><h2>🖋 원장 최종 발송 대기[\s\S]*onclick="rejectContractSend\(\$\{r\.id\}\)"/);
});

test('실행 시 비원장은 아무 작업도 하지 않고 원장만 요청 상태를 갱신한다', async () => {
  const source = html.match(/async function rejectContractSend\(id\)\{[\s\S]*?\n\}/);
  assert.ok(source, '반려 함수가 있어야 한다.');
  const calls = [];
  const query = {
    eq(key, value) { calls.push(['eq', key, value]); return this; },
    select(columns) { calls.push(['select', columns]); return Promise.resolve({data:[{id:10}],error:null}); }
  };
  const context = {
    CONTRACT_ROWS:[{id:10,status:'발송요청'}], ME:{role:'manager',name:'매니저'},
    confirm:message=>{calls.push(['confirm',message]);return true;},
    alert:message=>calls.push(['alert',message]), setStatus:value=>calls.push(['status',value]),
    render:()=>calls.push(['render']),
    sb:{from:table=>{calls.push(['from',table]);return {update:payload=>{calls.push(['update',payload]);return query;}};}}
  };
  vm.runInNewContext(source[0], context);
  await context.rejectContractSend(10);
  assert.deepEqual(calls, []);
  context.ME.role='owner';
  await context.rejectContractSend(10);
  assert.equal(calls.filter(call=>call[0]==='update').length, 1);
  const payload=calls.find(call=>call[0]==='update')[1];
  assert.equal(payload.status,'취소');
  assert.equal(payload.reviewed_by,'매니저');
  assert.ok(Number.isFinite(Date.parse(payload.reviewed_at)));
  assert.ok(calls.some(call=>call[0]==='eq'&&call[1]==='id'&&call[2]===10));
  assert.ok(calls.some(call=>call[0]==='eq'&&call[1]==='status'&&call[2]==='발송요청'));
  assert.ok(calls.some(call=>call[0]==='render'));
});

test('취소 계약은 기본 숨기고 켜면 보이며 반려 행만 반려됨으로 표시한다', () => {
  const helperStart = html.indexOf('function contractIsRejected(row){');
  const helperEnd = html.indexOf('\nfunction mergeContractHtml', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, '계약 표시 도우미가 있어야 한다.');
  const context = {CONTRACT_SHOW_CANCELLED:false};
  vm.runInNewContext(html.slice(helperStart, helperEnd), context);
  const rows = [
    {status:'취소',reviewed_at:'2026-09-28T00:00:00Z',sent_at:null},
    {status:'취소',reviewed_at:null,sent_at:null},
    {status:'대기'}
  ];
  assert.deepEqual(Array.from(context.contractVisibleRows(rows)), [rows[2]]);
  assert.equal(context.contractDisplayStatus(rows[0]), '반려됨');
  assert.equal(context.contractDisplayStatus(rows[1]), '취소');
  context.CONTRACT_SHOW_CANCELLED = true;
  assert.equal(context.contractVisibleRows(rows).length, 3);
  assert.match(html, /취소된 계약 보기/);
  assert.match(html, /onchange="setContractShowCancelled\(this\.checked\)"/);
});

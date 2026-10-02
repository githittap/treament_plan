// 근태 엑셀 올리기 — 타임북 지문인식기 내보내기(「출입일」·「출입시간」 + 「생성일자」가 같이 있음)도 날짜 칸을 바로 고르는지,
// 서식 없는 숫자 칸의 날짜·시각을 한국 시각 그대로 읽는지 본다(2026-10-02 원장 「9월 출퇴근 기록.xls」 — 실제 파일은 쓰지 않고 칸 이름만 본뜸).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const hr=fs.readFileSync(path.join(__dirname,'..','hr.html'),'utf8');
const grab=name=>{const i=hr.indexOf('function '+name+'(');assert.ok(i>=0,name);const end=name==='excelToDate'?hr.indexOf('\n}\n',i)+2:hr.indexOf('\n',i);return hr.slice(i,end);};
const {attXlColumns,excelToDate}=new Function(['findCol','findColPref','excelToDate','attXlColumns'].map(grab).join('\n')+';return {attXlColumns,excelToDate};')();

test('타임북 내보내기: 생성일자가 아니라 출입일·출입시간을 고름',()=>{
  const hdr=['No.','','수정 이력','사번','직원명 (Ctrl+F)','근태기명','USER ID','출입 구분','출입일','출입시간','인증시 소속','인증시 부서','인증 사진','인증방법','부서','인증기 번호','SmartCall 전화','생성일자'];
  assert.deepEqual({...attXlColumns(hdr)},{cName:4,cId:3,cDate:8,cTime:9});
});
test('예전 지문기 원본(발생일·입실시간)은 예전과 같은 칸',()=>{
  assert.deepEqual({...attXlColumns(['사번','성명','발생일','입실시간'])},{cName:1,cId:0,cDate:2,cTime:3});
  assert.deepEqual({...attXlColumns(['이름','날짜','시각'])},{cName:0,cId:-1,cDate:1,cTime:2});
});
test('날짜 칸이 생성·수정·등록 칸뿐이면 못 찾음으로 남김',()=>{
  const c=attXlColumns(['직원명','생성일자','수정일자','등록시간']);
  assert.equal(c.cDate,-1);assert.equal(c.cTime,-1);
});
test('서식 없는 숫자 칸 — 한국 시각 그대로(9시간 밀리지 않음)·초는 버림',()=>{
  const d=excelToDate(46266.4063657407);
  assert.deepEqual([d.getFullYear(),d.getMonth()+1,d.getDate(),d.getHours(),d.getMinutes()],[2026,9,1,9,45]);
  const t=excelToDate(0.8545601851);
  assert.deepEqual([t.getHours(),t.getMinutes()],[20,30]);
  assert.deepEqual([excelToDate(0.375).getHours(),excelToDate(0.375).getMinutes()],[9,0]);
  assert.equal(excelToDate('2026-09-01'),null);
  const same=new Date(2026,8,1,9,30);assert.equal(excelToDate(same),same,'날짜 서식 칸(Date)은 그대로');
});

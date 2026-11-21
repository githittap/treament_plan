// 입금 검색·날짜 조회(2026-11-22) 새 상태 화면의 「정답 파일」을 현재 hr.html로 한 번 만든다.
// 옛 화면(f95b951)에는 없던 상태라 옛 정답이 없음 — 만든 뒤 사람이 눈으로 검토해서 올린다(billing-monthly-golden.json 선례).
// 쓰는 법: node tests/manual/make-deposit-search-golden.cjs
const fs=require('node:fs'),path=require('node:path');
const {renderAll}=require('../fixtures/hub7-harness.cjs');
const NEW=['search_all','search_amount','custom_day','custom_range_q','trunc_known','trunc_unknown','cap','search_empty','load_error','xss','apply_err_format','apply_err_order','apply_ok'].map(k=>'dep.'+k);
(async()=>{
  const out=await renderAll(fs.readFileSync(path.join(__dirname,'..','..','hr.html'),'utf8'),{engine:false});
  const pick={};
  for(const k of NEW){if(!(k in out))throw new Error('하니스에 없음: '+k);pick[k]=out[k];}
  fs.writeFileSync(path.join(__dirname,'..','fixtures','deposit-search-golden.json'),JSON.stringify(pick,null,1)+'\n');
  console.log('정답 항목',Object.keys(pick).length);
})();

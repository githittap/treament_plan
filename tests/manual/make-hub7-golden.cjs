// 옛 hr.html(허브 글 옮기기 전, 커밋 f95b951)을 시험 도구로 돌려 「정답 파일」을 만든다.
// 2026-10-02 시간 표시 통일(feat/req5-time): 시각이 나오는 키(하네스가 hub-time 구간을 같이 실행)는 새 꼴로 정답을 다시 만들었음 — 옛 정답과의 차이는 시각 꼴뿐임을 키별로 확인(시각 꼴을 가린 채 비교). 새 꼴 이후에 다시 만들 때는 옛 hr.html이 아니라 현재 hr.html 경로를 줌.
// 쓰는 법: git show f95b951:hr.html > /tmp/hr-old.html && node tests/manual/make-hub7-golden.cjs /tmp/hr-old.html
const fs=require('node:fs'),path=require('node:path');
const {renderAll}=require('../fixtures/hub7-harness.cjs');
(async()=>{
  const src=process.argv[2];
  if(!src)throw new Error('옛 hr.html 경로를 주세요.');
  const out=await renderAll(fs.readFileSync(src,'utf8'),{engine:false});
  fs.writeFileSync(path.join(__dirname,'..','fixtures','hub7-golden-f95b951.json'),JSON.stringify(out,null,1)+'\n');
  console.log('정답 항목',Object.keys(out).length);
})();

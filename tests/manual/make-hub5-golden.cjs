// 옛 hr.html(허브 글 옮기기 전, 커밋 8829a7a)을 시험 도구로 돌려 「정답 파일」을 만든다.
// 쓰는 법: git show 8829a7a:hr.html > /tmp/hr-old.html && node tests/manual/make-hub5-golden.cjs /tmp/hr-old.html
const fs=require('node:fs'),path=require('node:path');
const {renderAll}=require('../fixtures/hub5-harness.cjs');
(async()=>{
  const src=process.argv[2];
  if(!src)throw new Error('옛 hr.html 경로를 주세요.');
  const out=await renderAll(fs.readFileSync(src,'utf8'),{engine:false});
  fs.writeFileSync(path.join(__dirname,'..','fixtures','hub5-golden-8829a7a.json'),JSON.stringify(out,null,1)+'\n');
  console.log('정답 항목',Object.keys(out).length);
})();

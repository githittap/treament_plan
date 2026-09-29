const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','hr.html'),'utf8');
const block=html.match(/\/\* contract-draft:test-start \*\/([\s\S]*?)\/\* contract-draft:test-end \*\//);
test('계약 임시저장 순수 도우미가 있다',()=>assert.ok(block));
if(block){
 const context={};vm.createContext(context);
 vm.runInContext(`${block[1]};this.contractSafeFields=contractSafeFields;this.contractDraftValue=contractDraftValue;this.contractPresetList=contractPresetList;`,context);
 test('임시저장에서 주민번호·생년월일·주소·성명을 제외한다',()=>{
  const clean={...context.contractSafeFields({성명:'이름',주민등록번호:'123',생년월일:'2000-01-01',주소:'주소',월급세전:'300',근무시간표:[{요일:'월'}]})};
  assert.deepEqual(clean,{월급세전:'300',근무시간표:[{요일:'월'}]});
 });
 test('발송 뒤 개인별 정보만 빈 값으로 만들고 설정값은 보존한다',()=>{
  const after={...context.contractSafeFields({생년월일:'2000-01-01',주소:'주소',주민등록번호:'123',월급세전:'300'},true)};
  assert.deepEqual(after,{월급세전:'300',생년월일:'',주소:'',주민등록번호:''});
 });
 test('서식 id가 다른 임시값은 적용하지 않는다',()=>{
  assert.equal(context.contractDraftValue({templateId:2},1),null);
  assert.equal(context.contractDraftValue({templateId:1},1).templateId,1);
 });
 test('설정 저장은 이름 기준 추가·덮어쓰기·삭제를 한다',()=>{
  let items=context.contractPresetList([], '표준');
  items[0].value=1;items=context.contractPresetList(items,'표준');
  assert.equal(items.length,1);assert.equal(items[0].name,'표준');
  assert.deepEqual([...context.contractPresetList(items,'표준',true)],[]);
 });
}
test('화면에 자동 저장·설정 제어·저장소 오류 보호 코드가 있다',()=>{
 assert.match(html,/setTimeout\(saveContractDraft,300\)/);
 assert.match(html,/catch\(_\)\{return null;\}/);
 assert.match(html,/새로 쓰기/);assert.match(html,/설정값 저장/);assert.match(html,/내 설정 불러오기/);
});
test('발송 성공 문구는 CONTRACT_FLASH로 렌더 직후 한 번만 보인다 (클로드 검토 보정)',()=>{
 assert.ok(html.includes(',CONTRACT_FLASH=null,CONTRACT_LOADED_PRESET=null;'),'CONTRACT_FLASH·CONTRACT_LOADED_PRESET 전역이 선언되어야 함');
 assert.ok(html.includes('const contractFlash=CONTRACT_FLASH;CONTRACT_FLASH=null;'),'렌더 직전에 플래시 메시지를 읽고 즉시 비워야 함(다음 렌더에서 다시 보이지 않게)');
 assert.ok(html.includes('<div class="msg" id="contractMsg">${contractFlash?esc(contractFlash):\'\'}</div>'),'contractMsg가 플래시 메시지를 출력해야 함');
 assert.ok(html.includes("CONTRACT_FLASH=finalSend?'발송했습니다.':'원장에게 최종 발송을 요청했습니다.';"),'sendContract 성공 시 CONTRACT_FLASH를 채워야 함(render가 msg를 지우기 전에 textContent에만 의존하지 않음)');
 assert.ok(html.includes("CONTRACT_FLASH='수정 후 발송했습니다.';"),'수정 후 최종 발송(CONTRACT_EDIT_ID 길) 성공 시에도 CONTRACT_FLASH를 채워야 함');
 assert.ok(html.includes("CONTRACT_FLASH='최종 발송을 완료했습니다.';"),'approveContractSend 성공 시에도 CONTRACT_FLASH를 채워야 함');
});
test('내 설정 불러오기 선택값은 렌더 후에도 유지되고, 삭제·새로 쓰기 뒤에는 비워진다 (클로드 검토 보정)',()=>{
 assert.ok(html.includes('CONTRACT_LOADED_PRESET=name;render();}'),'loadContractPreset은 불러온 이름을 전역에 기억해야 함(다음 render에서 선택값 유지)');
 assert.ok(html.includes("${p.name===CONTRACT_LOADED_PRESET?'selected':''}"),'내 설정 select 옵션 렌더에 selected 조건이 있어야 함');
 assert.ok(html.includes("if(!confirm(`'${name}' 설정을 지울까요?`))return;"),'deleteContractPreset은 삭제 전 확인을 한 번 받아야 함');
 assert.ok(html.includes("contractPresetList(contractStorageRead('Presets')||[],name,true));CONTRACT_LOADED_PRESET=null;render();}"),'삭제 뒤에는 기억해둔 선택값을 비워야 함');
 assert.ok(html.includes("CONTRACT_EMPLOYEE_ID='';CONTRACT_LOADED_PRESET=null;render();}"),'clearContractDraft(새로 쓰기) 뒤에도 기억해둔 선택값을 비워야 함');
});

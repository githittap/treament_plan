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

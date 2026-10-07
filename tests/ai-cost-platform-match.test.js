const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),html=read('hr.html');
function helpers(){const block=html.match(/\/\* aicost-platform:test-start \*\/[\s\S]*?\/\* aicost-platform:test-end \*\//)?.[0];assert.ok(block,'AI비용 플랫폼 매칭 helper가 없습니다.');const c={};vm.createContext(c);vm.runInContext(block+';this.h={AICOST_PLATFORMS,aicostPlatformKey};',c);return c.h;}

test('AICOST_PLATFORMS는 Claude·Codex(OpenAI)·Kimi·DeepSeek·StepFun 다음에 기타가 맨 끝으로 온다',()=>{
  const h=helpers();
  assert.deepEqual([...h.AICOST_PLATFORMS],['Claude','Codex(OpenAI)','Kimi','DeepSeek','StepFun','기타']);
});

test('aicostPlatformKey는 대소문자·앞뒤 공백을 무시해 목록 값으로 맞추고, 목록 밖 이름과 빈 값은 기타로 모은다',()=>{
  const h=helpers();
  const cases=[
    ['DeepSeek','DeepSeek'],['deepseek','DeepSeek'],
    [' STEPFUN ','StepFun'],['stepfun','StepFun'],
    ['Codex(OpenAI)','Codex(OpenAI)'],['codex(openai)','Codex(OpenAI)'],
    ['Kimi','Kimi'],
    ['Higgsfield','기타'],['','기타'],[null,'기타']
  ];
  for(const [input,expected] of cases)
    assert.equal(h.aicostPlatformKey(input),expected,`입력 ${JSON.stringify(input)}은(는) ${expected}이어야 합니다.`);
});

test('renderAicost의 자동감지 합산은 aicostPlatformKey로 이름을 맞춘 뒤 플랫폼별로 모으고, 원본 글자를 그대로 키로 쓰지 않는다',()=>{
  const body=html.match(/async function renderAicost\(m\)\{[\s\S]*?\r?\n\}\r?\n/)?.[0];
  assert.ok(body,'renderAicost 함수를 찾지 못했습니다.');
  assert.ok(body.includes("const k=aicostPlatformKey(e.platform,e.raw_text,config,e.card_merchant);autoByPlatform[k]=(autoByPlatform[k]||0)+Number(e.amount_krw||0);"),
    '자동감지 합산이 aicostPlatformKey로 이름을 맞추지 않습니다.');
  assert.ok(!body.includes('autoByPlatform[e.platform]'),'자동감지 합산이 원본 platform 글자를 그대로 키로 쓰면 안 됩니다.');
});

test('saveAicost(i)는 늘어난 목록에서도 AICOST_PLATFORMS[i]를 그대로 써서 저장한다(직접 입력 경로는 그대로 유지)',()=>{
  const body=html.match(/async function saveAicost\(i\)\{[\s\S]*?\r?\n\}\r?\n/)?.[0];
  assert.ok(body,'saveAicost 함수를 찾지 못했습니다.');
  assert.ok(body.includes("if(ME.role!=='owner'||!AICOST_PLATFORMS[i])return;"));
  assert.ok(body.includes('platform:AICOST_PLATFORMS[i]'));
});

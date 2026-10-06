// 운영 원본에서 만든 배포 후보를 로컬 대역 DB·환율로 실행하는 시험임.
// 운영 v12로 배포한 후보와 동일한 고정 사본을 사용함. 이 사본은 배포용이 아님.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const candidate=path.join(__dirname,'fixtures/ai-billing-webhook-v12');
const manifest=JSON.parse(fs.readFileSync(path.join(candidate,'manifest.json'),'utf8'));
assert.equal(manifest.version,12);
for(const [file,sha256] of Object.entries(manifest.sha256))assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(candidate,file),'utf8').replace(/\r\n/g,'\n')).digest('hex'),sha256,file+' 고정 사본이 변경됨');
const source=fs.readFileSync(path.join(candidate,'ai-billing-webhook/webhook_core.ts'),'utf8');
const helpers={...require(path.join(candidate,'ai-billing-webhook/naver_ads.mjs')),...require(path.join(candidate,'ai-billing-webhook/marketing_expenses.mjs')),...require(path.join(candidate,'navertalk-webhook/payload.mjs'))};
function harness({fxFail=false}={}){
  const stored=[],fetches=[];
  const c={...helpers,URL,Response,Request,AbortSignal,fetch:async url=>{fetches.push(url);if(fxFail)throw new Error('합성 오프라인');return {json:async()=>({rates:{KRW:1500}})};},createClient:()=>({from:table=>({select:()=>({eq:()=>({single:async()=>({data:{value:'synthetic-test-token'},error:null})})}),insert:async row=>{assert.equal(table,'ai_billing_events');stored.push(row);return {error:null};}})})};
  vm.createContext(c);vm.runInContext(stripTypeScriptTypes(source.replace(/^import[^\n]+\n/gm,'').replace('export function createWebhookHandler','function createWebhookHandler'))+';this.handler=createWebhookHandler(createClient,()=> "synthetic-local-value");',c);
  const handler=c.handler;
  return {stored,fetches,async run(platform,body){const response=await handler(new Request('https://synthetic.invalid/?platform='+encodeURIComponent(platform),{method:'POST',headers:{'X-Webhook-Token':'synthetic-test-token'},body}));return {status:response.status,value:await response.json()};}};
}
const domestic=amount=>'삼성0000승인 합성\n12,000원 일시불\n10/06 12:00 TYPECAST.AI\n누적'+amount+'원';

test('기존 handler: 삼성 해외승인과 국내승인은 로컬 대역만으로 AI 결제 경로에 정상 금액을 저장함',async()=>{
  const h=harness();const foreign=await h.run('Higgsfield','삼성0000해외승인 합성\nUSD 200.00\n10/03 01:41 HIGGSFIELDINC.');
  assert.equal(foreign.status,200);assert.equal(foreign.value.amount_krw,300000);
  const local=await h.run('Typecast',domestic('0'));assert.equal(local.status,200);assert.equal(local.value.amount_krw,12000);
  assert.deepEqual(h.stored.map(x=>x.platform),['Higgsfield','Typecast']);assert.equal(h.fetches.length,1);
});

test('수정된 결함: 누적 990,000원이 있어도 실제 결제 12,000원만 저장함',async()=>{
  const h=harness(),r=await h.run('Typecast',domestic('990,000'));assert.equal(r.status,200);assert.equal(r.value.amount_krw,12000);assert.equal(h.stored[0].amount_krw,12000);
});

test('수정된 결함: 힉스필드 해외원화 KRW 앞표시는 환율 조회 없이 원화로 저장함',async()=>{
  const h=harness(),r=await h.run('Higgsfield','삼성0000해외승인 합성\nKRW 91,477\n10/06 12:00 HIGGSFIELDINC.');
  assert.equal(r.status,200);assert.equal(r.value.amount_krw,91477);assert.equal(h.stored[0].amount_krw,91477);assert.equal(h.fetches.length,0);
});

test('알려진 미수정 문제: 결제 문자 원문이 DB insert의 raw_text에 그대로 남음',async()=>{
  const h=harness();await h.run('Typecast',domestic('0'));assert.equal(h.stored[0].raw_text,domestic('0'));
});

test('알려진 미수정 문제: 환율 조회 실패 시 고정 1,500원이 아닌 기존 1,380원 환산을 사용함',async()=>{
  const h=harness({fxFail:true}),r=await h.run('Claude','삼성0000해외승인 합성\nUSD 200.00\n10/03 01:41 ANTHROPIC*CLAUDESUB');
  assert.equal(r.status,200);assert.equal(r.value.amount_krw,276000);
});

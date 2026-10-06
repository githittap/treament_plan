import { safeNotification } from "./transport.ts";
import { processClaimedEvent, type DispatcherDb } from "./dispatcher_core.ts";
import type { PushEvent } from "./transport.ts";
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
Deno.test("건의 댓글 기본 문구·이동 탭·본문 제외",()=>{
  const n=safeNotification("suggestion_commented",{suggestion_title:"개선안",commenter_name:"홍길동",body:"비공개 댓글"});
  check(n?.title==="💬 건의에 새 댓글","제목");check(n.body==='「개선안」에 홍길동님이 댓글을 달았어요',"본문 문구");check(n.url==="/hr.html?tab=suggestions","건의함 이동");check(!JSON.stringify(n).includes("비공개 댓글"),"댓글 원문 제외");
});
Deno.test("건의 댓글 DB 문구와 제목 40자·이름 길이 제한",()=>{
  const n=safeNotification("suggestion_commented",{suggestion_title:"가".repeat(60),commenter_name:"김\n직원",push_title:"답글 도착",push_body_template:"{name} — {title}"});
  check(n?.title==="답글 도착","DB 제목");check(n.body==='김 직원 — '+"가".repeat(40),"치환·제한");
});
Deno.test("dispatcher_core가 댓글 이벤트를 실제 발송 경로로 처리함",async()=>{
  const payloads:string[]=[],released:Record<string,unknown>[]=[];
  const db:DispatcherDb={renewClaim:async()=>{},getProfile:async()=>({data:{active:true,approved:true},error:null}),canDispatchAiBillingPush:async()=>({data:false,error:null}),getSubscriptions:async()=>({data:[{id:"sub",endpoint:"https://fcm.googleapis.com/test",p256dh:"test",auth:"test"}],error:null}),disableUnsafeSubscription:async()=>{},seedDeliveries:async()=>null,getDeliveries:async()=>({data:[],error:null}),recordDelivery:async()=>{},releaseEvent:async(_e,_c,fields)=>{released.push(fields);}};
  const event:PushEvent={id:7,event_key:"suggestion-comment:7:user:other",recipient_id:"other",event_type:"suggestion_commented",attempts:1,payload:{suggestion_id:1,suggestion_title:"정리함",commenter_name:"직원",push_title:"원장 지정 문구",push_body_template:"{title} / {name}",body:"원문은 버림"}};
  const result=await processClaimedEvent(event,"claim",db,async(_s,payload)=>{payloads.push(payload);});
  check(result.status==="sent"&&result.sent===1,"발송 완료");check(payloads.length===1,"한 번 발송");const n=JSON.parse(payloads[0]);check(n.title==="원장 지정 문구"&&n.body==="정리함 / 직원","DB 문구");check(n.url==="/hr.html?tab=suggestions","이동 탭");check(!payloads[0].includes("원문은 버림"),"원문 없음");check(released[0].status==="sent","상태 기록");
});
Deno.test("운영 v7 알림 14종 + 건의 댓글이 모두 문구를 가진다(마케팅 4종 누락 회귀 방지)",()=>{
  for(const t of ["leave_submitted","leave_status_changed","consultation_received","payment_pending","approval_submitted","notice_published","document_approved","ai_billing_stop","ai_billing_low_balance","ai_billing_charge","marketing_expense_recorded","marketing_expense_cancelled","marketing_expense_review","marketing_budget_alert","suggestion_commented"])check(safeNotification(t,{}),t);
});

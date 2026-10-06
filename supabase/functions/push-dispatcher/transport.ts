export type PushEvent = { id: number; event_key: string; recipient_id: string; event_type: string; attempts: number; payload?: Record<string, unknown> };
export type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };
export class DispatchAbortError extends Error { readonly code = "dispatch-abort"; }
const ALLOWED_PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "notify.windows.com"];

export function isSafePushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || (url.port && url.port !== "443")) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (url.username || url.password || !ALLOWED_PUSH_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`))) return false;
    return true;
  } catch { return false; }
}

function aiBillingDetails(payload: Record<string, unknown>): string {
  const name = typeof payload.account_name === "string" ? payload.account_name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const accountId = typeof payload.account_id === "string" && /^\d{5,}$/.test(payload.account_id) ? payload.account_id : "";
  const account = [name, accountId ? `(${accountId})` : ""].filter(Boolean).join(" ");
  const amount = typeof payload.amount_krw === "number" && Number.isSafeInteger(payload.amount_krw) && payload.amount_krw > 0 ? payload.amount_krw : null;
  const threshold = typeof payload.threshold_krw === "number" && Number.isSafeInteger(payload.threshold_krw) && payload.threshold_krw > 0 ? payload.threshold_krw : null;
  const value = amount ? `${amount.toLocaleString("ko-KR")}원` : threshold ? `${threshold.toLocaleString("ko-KR")}원 이하` : "";
  return [account ? `계정 ${account}` : "", value].filter(Boolean).join(" · ");
}

export function safeNotification(eventType: string, payload: Record<string, unknown> = {}): { title: string; body: string; url: string; tag: string } | null {
  if (eventType === "suggestion_commented") {
    const text = (value: unknown, max: number, fallback: string) => typeof value === "string" && value.trim() ? Array.from(value.replace(/[\u0000-\u001f\u007f]/g, " ").trim()).slice(0, max).join("") : fallback;
    const title = text(payload.suggestion_title, 40, ""), name = text(payload.commenter_name, 60, "");
    const template = text(payload.push_body_template, 500, "「{title}」에 {name}님이 댓글을 달았어요");
    return { title: text(payload.push_title, 120, "💬 건의에 새 댓글"), body: template.replace(/\{(title|name)\}/g, (_match, key) => key === "title" ? title : name), url: "/hr.html?tab=suggestions", tag: "suggestion-commented" };
  }
  if (eventType === "leave_submitted") return { title: "연차 신청 알림", body: "새 연차 신청을 확인해 주세요.", url: "/hr.html?tab=leave", tag: "leave-submitted" };
  if (eventType === "leave_status_changed") return { title: "연차 신청 상태 변경", body: "연차 신청 상태가 변경되었습니다.", url: "/hr.html?tab=leave", tag: "leave-status" };
  if (eventType === "approval_submitted") return { title: "결재 대기 알림", body: "확인할 결재 문서가 있습니다.", url: "/hr.html?tab=appr", tag: "approval-pending" };
  if (eventType === "payment_pending") return { title: "결제 요청 알림", body: "확인할 결제 요청이 있습니다.", url: "/hr.html?tab=onbo", tag: "payment-pending" };
  if (eventType === "notice_published") return { title: "새 공지 알림", body: "새 공지가 등록되었습니다.", url: "/hr.html?tab=notice", tag: "notice-published" };
  if (eventType === "document_approved") return { title: "서류 승인 알림", body: "제출한 서류가 승인되었습니다.", url: "/hr.html?tab=onbo", tag: "document-approved" };
  if (eventType === "consultation_received") return { title: "새 문의 알림", body: "새 문의가 도착했습니다.", url: "/hr.html?tab=inbox", tag: "consultation-received" };
  if (eventType === "ai_billing_stop") return { title: "네이버 광고 노출 중단", body: [aiBillingDetails(payload), "광고 노출 중단 내용을 허브에서 확인해 주세요."].filter(Boolean).join(" · "), url: "/hr.html?tab=inbox", tag: "ai-billing-stop" };
  if (eventType === "ai_billing_low_balance") return { title: "네이버 광고 잔액 안내", body: [aiBillingDetails(payload), "잔액 안내를 허브에서 확인해 주세요."].filter(Boolean).join(" · "), url: "/hr.html?tab=inbox", tag: "ai-billing-low-balance" };
  if (eventType === "ai_billing_charge") return { title: "네이버 광고 충전 완료", body: [aiBillingDetails(payload), "충전 기록을 허브에서 확인해 주세요."].filter(Boolean).join(" · "), url: "/hr.html?tab=inbox", tag: "ai-billing-charge" };
  return null;
}

export type DispatchResult = { sent: number; expired: number; failed: number; expiredEndpoints: string[]; sentEndpoints: string[]; failedEndpoints: string[] };
export type DeliveryOutcome = "sent" | "expired" | "failed";
export async function dispatchSubscriptions(event: PushEvent, subscriptions: Subscription[], send: (subscription: Subscription, payload: string) => Promise<void>, record?: (subscription: Subscription, outcome: DeliveryOutcome) => Promise<void>): Promise<DispatchResult> {
  const notification = safeNotification(event.event_type, event.payload || {});
  if (!notification) return { sent: 0, expired: 0, failed: subscriptions.length, expiredEndpoints: [], sentEndpoints: [], failedEndpoints: subscriptions.map(s => s.endpoint) };
  let sent = 0, expired = 0, failed = 0; const expiredEndpoints: string[] = [], sentEndpoints: string[] = [], failedEndpoints: string[] = [];
  for (const subscription of subscriptions) {
    if (!isSafePushEndpoint(subscription.endpoint)) { failed++; failedEndpoints.push(subscription.endpoint); await record?.(subscription, "failed"); continue; }
    let outcome: DeliveryOutcome = "sent";
    try { await send(subscription, JSON.stringify({ ...notification, event_id: event.event_key })); sent++; sentEndpoints.push(subscription.endpoint); }
    catch (error) { if (error instanceof DispatchAbortError) throw error; const status = Number((error as { statusCode?: number })?.statusCode || 0); if (status === 404 || status === 410) { expired++; expiredEndpoints.push(subscription.endpoint); outcome = "expired"; } else { failed++; failedEndpoints.push(subscription.endpoint); outcome = "failed"; } }
    await record?.(subscription, outcome);
  }
  return { sent, expired, failed, expiredEndpoints, sentEndpoints, failedEndpoints };
}

export type PushEvent = { id: number; event_key: string; recipient_id: string; event_type: string; attempts: number };
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

export function safeNotification(eventType: string): { title: string; body: string; url: string; tag: string } | null {
  if (eventType === "leave_submitted") return { title: "연차 신청 알림", body: "새 연차 신청을 확인해 주세요.", url: "/hr.html?tab=leave", tag: "leave-submitted" };
  if (eventType === "leave_status_changed") return { title: "연차 신청 상태 변경", body: "연차 신청 상태가 변경되었습니다.", url: "/hr.html?tab=leave", tag: "leave-status" };
  return null;
}

export type DispatchResult = { sent: number; expired: number; failed: number; expiredEndpoints: string[]; sentEndpoints: string[]; failedEndpoints: string[] };
export type DeliveryOutcome = "sent" | "expired" | "failed";
export async function dispatchSubscriptions(event: PushEvent, subscriptions: Subscription[], send: (subscription: Subscription, payload: string) => Promise<void>, record?: (subscription: Subscription, outcome: DeliveryOutcome) => Promise<void>): Promise<DispatchResult> {
  const notification = safeNotification(event.event_type);
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

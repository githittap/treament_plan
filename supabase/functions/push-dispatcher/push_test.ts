import { dispatchSubscriptions, isSafePushEndpoint, safeNotification } from "./transport.ts";

Deno.test("push payload is generic and same-origin", () => {
  const payload = safeNotification("leave_submitted");
  if (!payload) throw new Error("payload missing");
  if (payload.body.includes("사유") || !payload.url.startsWith("/hr.html")) throw new Error("unsafe notification payload");
});

Deno.test("endpoint guard blocks non-HTTPS and private targets", () => {
  if (isSafePushEndpoint("http://localhost:54321/push")) throw new Error("localhost allowed");
  if (isSafePushEndpoint("https://192.168.0.10/push")) throw new Error("private address allowed");
  if (!isSafePushEndpoint("https://fcm.googleapis.com/fcm/send/subscription")) throw new Error("valid FCM endpoint blocked");
  if (isSafePushEndpoint("https://evil.example/fcm")) throw new Error("unapproved endpoint allowed");
});

Deno.test("mock transport counts sent, expired, and transient failures without network", async () => {
  const events = { id: 1, event_key: "leave-request:1:employee:u:승인", recipient_id: "u", event_type: "leave_status_changed", attempts: 0 };
  const subscriptions = [
    { id: "a0000000-0000-0000-0000-000000000001", endpoint: "https://fcm.googleapis.com/ok", p256dh: "p", auth: "a" },
    { id: "a0000000-0000-0000-0000-000000000002", endpoint: "https://fcm.googleapis.com/expired", p256dh: "p", auth: "a" },
    { id: "a0000000-0000-0000-0000-000000000003", endpoint: "https://fcm.googleapis.com/transient", p256dh: "p", auth: "a" },
  ];
  const outcomes: string[] = [];
  const result = await dispatchSubscriptions(events, subscriptions, async (subscription) => {
    if (subscription.id === "a0000000-0000-0000-0000-000000000002") throw Object.assign(new Error("gone"), { statusCode: 410 });
    if (subscription.id === "a0000000-0000-0000-0000-000000000003") throw Object.assign(new Error("temporary"), { statusCode: 503 });
  }, async (subscription, outcome) => { outcomes.push(`${subscription.id}:${outcome}`); });
  if (result.sent !== 1 || result.expired !== 1 || result.failed !== 1 || result.expiredEndpoints.length !== 1) throw new Error("mock transport result mismatch");
  if (outcomes.join(',') !== 'a0000000-0000-0000-0000-000000000001:sent,a0000000-0000-0000-0000-000000000002:expired,a0000000-0000-0000-0000-000000000003:failed') throw new Error("per-device outcome was not recorded immediately");
});

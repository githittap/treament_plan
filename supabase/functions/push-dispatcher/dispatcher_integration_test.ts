import { isAuthorizedPushRequest, processClaimedEvent, type DispatcherDb } from "./dispatcher_core.ts";
import type { PushEvent, Subscription } from "./transport.ts";

const event: PushEvent = { id: 10, event_key: "leave-request:10:employee:u:대기", recipient_id: "u", event_type: "leave_submitted", attempts: 1 };
const subscriptions: Subscription[] = [
  { id: "a0000000-0000-0000-0000-000000000001", endpoint: "https://fcm.googleapis.com/device-1", p256dh: "p", auth: "a" },
  { id: "a0000000-0000-0000-0000-000000000002", endpoint: "https://fcm.googleapis.com/device-2", p256dh: "p", auth: "a" },
];

export async function runDispatcherIntegrationTest() {
  if (isAuthorizedPushRequest(new Request("https://example.test", { method: "GET", headers: { "x-push-dispatch-secret": "secret" } }), "secret")) throw new Error("GET was authorized");
  if (!isAuthorizedPushRequest(new Request("https://example.test", { method: "POST", headers: { "x-push-dispatch-secret": "secret" } }), "secret")) throw new Error("valid POST was rejected");
  if (isAuthorizedPushRequest(new Request("https://example.test", { method: "POST", headers: { "x-push-dispatch-secret": "wrong" } }), "secret")) throw new Error("wrong secret was authorized");

  const deliveries = new Map<string, string>();
  const released: Record<string, unknown>[] = [];
  const claimed = new Set<string>();
  let renewCount = 0;
  let loseAt = 0;
  let profileError: Error | null = null;
  const db: DispatcherDb = {
    renewClaim: async (_event, token) => { renewCount++; if (loseAt && renewCount === loseAt) throw new Error("claim lost"); claimed.add(token); },
    getProfile: async () => ({ data: profileError ? null : { active: true, approved: true }, error: profileError }),
    getSubscriptions: async () => ({ data: subscriptions, error: null }),
    disableUnsafeSubscription: async () => {},
    seedDeliveries: async () => null,
    getDeliveries: async currentEvent => ({ data: currentEvent.id === 11 ? [] : [...deliveries].map(([subscription_id, status]) => ({ subscription_id, status })), error: null }),
    recordDelivery: async (_event, subscription, outcome, token) => { if (!claimed.has(token)) throw new Error("claim lost during delivery record"); deliveries.set(subscription.id, outcome === "sent" ? "sent" : "failed"); },
    releaseEvent: async (_event, token, fields) => { if (!claimed.has(token)) throw new Error("claim was not held"); released.push(fields); },
  };

  profileError = new Error("temporary profile DB failure");
  const dbFailure = await processClaimedEvent(event, "claim-db", db, async () => {});
  if (dbFailure.status !== "db-error" || released.at(-1)?.status !== "queued") throw new Error("DB failure was not queued");

  profileError = null;
  const first = await processClaimedEvent(event, "claim-first", db, async subscription => {
    if (subscription.id === "a0000000-0000-0000-0000-000000000002") throw Object.assign(new Error("temporary"), { statusCode: 503 });
  });
  if (first.status !== "queued" || deliveries.get("a0000000-0000-0000-0000-000000000001") !== "sent" || deliveries.get("a0000000-0000-0000-0000-000000000002") !== "failed") throw new Error(`partial success was not persisted immediately: ${JSON.stringify({ first, deliveries: [...deliveries] })}`);

  const retry = await processClaimedEvent({ ...event, attempts: 2 }, "claim-retry", db, async subscription => {
    if (subscription.id !== "a0000000-0000-0000-0000-000000000002") throw new Error("sent device was retried");
  });
  if (retry.status !== "sent" || deliveries.get("a0000000-0000-0000-0000-000000000002") !== "sent") throw new Error("failed device was not retried to terminal success");

  const beforeClaimLoss = [...deliveries];
  let sendsAfterClaimLoss = 0;
  loseAt = renewCount + 2;
  try {
    await processClaimedEvent({ ...event, id: 11, attempts: 1 }, "claim-lost", db, async () => { sendsAfterClaimLoss++; });
    throw new Error("claim loss was not propagated");
  } catch (error) {
    if (!String((error as Error).message).includes("claim lease lost")) throw error;
  }
  if (sendsAfterClaimLoss !== 0 || JSON.stringify([...deliveries]) !== JSON.stringify(beforeClaimLoss)) throw new Error("claim loss reached send or delivery recording");
}

Deno.test("dispatcher integration covers auth, DB error, partial success, and retry", runDispatcherIntegrationTest);

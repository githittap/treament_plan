import { dispatchSubscriptions, DispatchAbortError, isSafePushEndpoint, type PushEvent, type Subscription } from "./transport.ts";

export type DispatcherError = { message: string };
export type DispatcherProfile = { active: boolean; approved: boolean } | null;
export type DispatcherResult = { id: number; status: string; sent?: number; expired?: number; failed?: number };

export type DispatcherDb = {
  renewClaim(event: PushEvent, claimToken: string): Promise<void>;
  getProfile(recipientId: string): Promise<{ data: DispatcherProfile; error: DispatcherError | null }>;
  getSubscriptions(recipientId: string): Promise<{ data: Subscription[]; error: DispatcherError | null }>;
  disableUnsafeSubscription(subscription: Subscription): Promise<void>;
  seedDeliveries(event: PushEvent, subscriptions: Subscription[]): Promise<DispatcherError | null>;
  getDeliveries(event: PushEvent): Promise<{ data: { subscription_id: string; status: string }[]; error: DispatcherError | null }>;
  recordDelivery(event: PushEvent, subscription: Subscription, outcome: "sent" | "expired" | "failed", claimToken: string): Promise<void>;
  releaseEvent(event: PushEvent, claimToken: string, fields: Record<string, unknown>): Promise<void>;
};

const MAX_ATTEMPTS = 5;

export function isAuthorizedPushRequest(req: Request, expectedSecret: string | undefined): boolean {
  return req.method === "POST" && !!expectedSecret && req.headers.get("x-push-dispatch-secret") === expectedSecret;
}

function retryAt(attempts: number, baseMs = 60_000): string {
  return new Date(Date.now() + baseMs * attempts).toISOString();
}

export async function processClaimedEvent(
  event: PushEvent,
  claimToken: string,
  db: DispatcherDb,
  send: (subscription: Subscription, payload: string) => Promise<void>,
): Promise<DispatcherResult> {
  const release = (fields: Record<string, unknown>) => db.releaseEvent(event, claimToken, fields);
  await db.renewClaim(event, claimToken);

  const profile = await db.getProfile(event.recipient_id);
  if (profile.error) {
    await release({ status: event.attempts >= MAX_ATTEMPTS ? "failed" : "queued", last_error: `profile lookup failed: ${profile.error.message}`, next_attempt_at: retryAt(event.attempts) });
    return { id: event.id, status: "db-error" };
  }
  if (!profile.data?.active || !profile.data.approved) {
    await release({ status: "failed", last_error: "recipient inactive or unapproved" });
    return { id: event.id, status: "skipped" };
  }

  const subscriptions = await db.getSubscriptions(event.recipient_id);
  if (subscriptions.error) {
    await release({ status: event.attempts >= MAX_ATTEMPTS ? "failed" : "queued", last_error: `subscription lookup failed: ${subscriptions.error.message}`, next_attempt_at: retryAt(event.attempts) });
    return { id: event.id, status: "db-error" };
  }
  const safeSubscriptions = subscriptions.data.filter(subscription => isSafePushEndpoint(subscription.endpoint));
  for (const subscription of subscriptions.data.filter(subscription => !isSafePushEndpoint(subscription.endpoint))) await db.disableUnsafeSubscription(subscription);
  if (!safeSubscriptions.length) {
    await release({ status: "failed", last_error: "no safe active subscription" });
    return { id: event.id, status: "no-subscription" };
  }

  const seedError = await db.seedDeliveries(event, safeSubscriptions);
  if (seedError) {
    await release({ status: event.attempts >= MAX_ATTEMPTS ? "failed" : "queued", last_error: `delivery seed failed: ${seedError.message}`, next_attempt_at: retryAt(event.attempts) });
    return { id: event.id, status: "db-error" };
  }
  const deliveries = await db.getDeliveries(event);
  if (deliveries.error) {
    await release({ status: event.attempts >= MAX_ATTEMPTS ? "failed" : "queued", last_error: `delivery lookup failed: ${deliveries.error.message}`, next_attempt_at: retryAt(event.attempts) });
    return { id: event.id, status: "db-error" };
  }
  const sentIds = new Set(deliveries.data.filter(delivery => delivery.status === "sent").map(delivery => delivery.subscription_id));
  const pendingSubscriptions = safeSubscriptions.filter(subscription => !sentIds.has(subscription.id));
  const result = await dispatchSubscriptions(event, pendingSubscriptions, async (subscription, payload) => {
    try { await db.renewClaim(event, claimToken); } catch (error) { throw new DispatchAbortError(`claim lease lost before send: ${(error as Error).message}`); }
    await send(subscription, payload);
  }, async (subscription, outcome) => {
    await db.renewClaim(event, claimToken);
    await db.recordDelivery(event, subscription, outcome, claimToken);
  });
  const terminal = result.sent + result.expired >= pendingSubscriptions.length;
  const status = terminal ? "sent" : event.attempts >= MAX_ATTEMPTS ? "failed" : "queued";
  await release({ status, last_error: result.failed ? `failed=${result.failed}` : null, next_attempt_at: status === "queued" ? new Date(Date.now() + Math.min(60_000 * 2 ** Math.max(0, event.attempts - 1), 3_600_000)).toISOString() : null, sent_at: status === "sent" ? new Date().toISOString() : null });
  return { id: event.id, status, sent: result.sent, expired: result.expired, failed: result.failed };
}

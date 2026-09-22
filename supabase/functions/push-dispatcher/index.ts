// Deploy only after VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT and
// PUSH_DISPATCH_SECRET are configured in the Edge Function environment.
// Never commit those values or send real notifications from local tests.
//
// push_subscriptions/push_events/push_event_deliveries grant NOTHING directly to service_role
// (least privilege). Every persistence call below goes through a SECURITY DEFINER RPC from
// db/push_notifications_draft.sql that validates this dispatcher currently holds the event's
// claim_token before it will read or write anything tied to that event's recipient.

import { isAuthorizedPushRequest, processClaimedEvent } from "./dispatcher_core.ts";
import type { PushEvent, Subscription } from "./transport.ts";

const BATCH_SIZE = 5;

function json(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }

Deno.serve(async (req) => {
  if (!isAuthorizedPushRequest(req, Deno.env.get("PUSH_DISPATCH_SECRET"))) return json({ error: "unauthorized" }, 401);
  // @ts-ignore deployed Edge Functions resolve npm imports; local mock tests do not need them.
  const { createClient } = await import("npm:@supabase/supabase-js@2.110.9");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // @ts-ignore deployed Edge Functions resolve npm imports; local mock tests do not need them.
  const webpush = (await import("npm:web-push@3.6.7")).default;
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY"), vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY"), vapidSubject = Deno.env.get("VAPID_SUBJECT");
  if (!vapidPublic || !vapidPrivate || !vapidSubject) return json({ error: "push sender is not configured" }, 503);
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const claimToken = crypto.randomUUID();
  const { data: events, error: eventsError } = await supabase.rpc("claim_push_events", { p_claim_token: claimToken, p_limit: BATCH_SIZE });
  if (eventsError) return json({ error: eventsError.message }, 500);
  const results = [];
  for (const event of (events || []) as PushEvent[]) {
    const result = await processClaimedEvent(event, claimToken, {
      renewClaim: async (currentEvent, token) => {
        const { error } = await supabase.rpc("renew_push_event_claim", { p_event_id: currentEvent.id, p_claim_token: token });
        if (error) throw new Error(`claim lease lost: ${error.message}`);
      },
      getProfile: async () => {
        const { data, error } = await supabase.rpc("get_push_event_recipient_status", { p_event_id: event.id, p_claim_token: claimToken });
        if (error) return { data: null, error };
        const row = (data || [])[0];
        return { data: row ? { active: row.active, approved: row.approved } : null, error: null };
      },
      getSubscriptions: async () => {
        const { data, error } = await supabase.rpc("get_push_event_subscriptions", { p_event_id: event.id, p_claim_token: claimToken });
        if (error) return { data: [], error };
        const rows = (data || []) as { subscription_id: string; endpoint: string; subscription: { keys?: { p256dh?: string; auth?: string } } }[];
        const subscriptions: Subscription[] = rows.map(row => ({ id: row.subscription_id, endpoint: row.endpoint, p256dh: row.subscription?.keys?.p256dh || "", auth: row.subscription?.keys?.auth || "" }));
        return { data: subscriptions, error: null };
      },
      disableUnsafeSubscription: async subscription => {
        const { error } = await supabase.rpc("delete_push_event_subscription", { p_event_id: event.id, p_claim_token: claimToken, p_subscription_id: subscription.id });
        if (error) throw new Error(`unsafe subscription delete failed: ${error.message}`);
      },
      seedDeliveries: async (currentEvent, subscriptions) => {
        const { error } = await supabase.rpc("seed_push_event_deliveries", { p_event_id: currentEvent.id, p_claim_token: claimToken, p_subscription_ids: subscriptions.map(s => s.id) });
        return error;
      },
      getDeliveries: async currentEvent => {
        const { data, error } = await supabase.rpc("get_push_event_deliveries", { p_event_id: currentEvent.id, p_claim_token: claimToken });
        return { data: data || [], error };
      },
      recordDelivery: async (currentEvent, subscription, outcome, token) => {
        const { error } = await supabase.rpc("record_push_delivery", { p_event_id: currentEvent.id, p_subscription_id: subscription.id, p_claim_token: token, p_outcome: outcome, p_attempts: currentEvent.attempts });
        if (error) throw new Error(`delivery update failed: ${error.message}`);
      },
      releaseEvent: async (currentEvent, token, fields) => {
        const { error } = await supabase.rpc("release_push_event", { p_event_id: currentEvent.id, p_claim_token: token, p_status: fields.status, p_last_error: fields.last_error ?? null, p_next_attempt_at: fields.next_attempt_at ?? null, p_sent_at: fields.sent_at ?? null });
        if (error) throw new Error(`event update failed: ${error.message}`);
      },
    }, async (subscription, payload) => webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 300, timeout: 8_000 }));
    results.push(result);
  }
  return json({ processed: results.length, results });
});

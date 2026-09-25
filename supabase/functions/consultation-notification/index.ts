// 별도 신규 MacroDroid 매크로에서 원문 알림을 받는다. 기존 수집 매크로는 변경하지 않는다.
// X-Event-Id는 알림별로 달라지고 재시도에는 같아야 한다. 토큰·본문은 기록하지 않는다.
import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
import { handleNotification, type NotificationDeps } from './core.ts';
import { sameHex, sha256Hex } from './payload.mjs';

Deno.serve(async req => {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !serviceKey) return new Response('{"ok":false}', { status: 500, headers: { 'content-type': 'application/json' } });
  const sb = createClient(url, serviceKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${serviceKey}` } } });
  const deps: NotificationDeps = {
    verifyToken: async (token, source) => {
      const secretName = source === 'homepage' ? 'homepage_online_sha256' : 'consultation_notification_sha256';
      const { data, error } = await sb.from('webhook_secrets').select('value').eq('name', secretName).maybeSingle();
      return !error && !!data?.value && sameHex(await sha256Hex(token), String(data.value));
    },
    ingest: async ({ source, eventId, message, senderName, contact, subject, receivedAt }) => {
      const { error } = await sb.rpc('consultation_inbox_ingest_service', {
        p_source: source, p_event_id: eventId, p_received_at: receivedAt ?? null, p_sender_name: senderName ?? null,
        p_contact: contact ?? null, p_subject: subject ?? null, p_message: message,
      });
      return !error;
    },
  };
  return handleNotification(req, deps);
});

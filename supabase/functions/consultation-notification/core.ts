import { MAX_BODY_BYTES, notificationPayload } from './payload.mjs';

export interface NotificationDeps {
  verifyToken(token: string): Promise<boolean>;
  ingest(params: { source: string; eventId: string; message: string }): Promise<boolean>;
}

function reply(status: number): Response {
  return new Response(JSON.stringify({ ok: status < 400 }), { status, headers: { 'content-type': 'application/json' } });
}

export async function handleNotification(req: Request, deps: NotificationDeps): Promise<Response> {
  if (req.method !== 'POST') return reply(405);
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY_BYTES) return reply(413);
  const token = req.headers.get('x-webhook-token') || '';
  if (token.length < 32 || token.length > 256 || !(await deps.verifyToken(token))) return reply(401);
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return reply(413);
  const url = new URL(req.url);
  const payload = notificationPayload(url.searchParams.get('source'), req.headers.get('x-event-id'), raw);
  if (!payload) return reply(400);
  return reply(await deps.ingest(payload) ? 200 : 500);
}

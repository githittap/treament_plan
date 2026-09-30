import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createWebhookHandler } from './webhook_core.ts';

const handler = createWebhookHandler(createClient, (name: string) => Deno.env.get(name));
if (import.meta.main) Deno.serve(handler);
export { handler };

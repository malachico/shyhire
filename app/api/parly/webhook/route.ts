import { TalentError } from '@/lib/profiles';
import { roomViews } from '@/lib/roomViews';
import { verifyParlySignature } from '@/lib/webhooks';

/** Parly's room events (needs_decision, document_updated, agreed, stuck, closed). Verified and persisted idempotently on event.id. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyParlySignature(request.headers.get('parly-signature'), raw, process.env.PARLY_WEBHOOK_SECRET ?? '')) {
    return Response.json({ error: 'Bad signature' }, { status: 401 });
  }
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    const result = await roomViews().handleWebhookEvent(event);
    return Response.json(result);
  } catch (error) {
    if (error instanceof TalentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

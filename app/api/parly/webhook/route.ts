import { verifyParlySignature } from '@/lib/webhooks';

/** Parly's room events (needs_decision, document_updated, agreed, stuck, closed). Verified, then logged for now. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyParlySignature(request.headers.get('parly-signature'), raw, process.env.PARLY_WEBHOOK_SECRET ?? '')) {
    return Response.json({ error: 'Bad signature' }, { status: 401 });
  }
  const event = JSON.parse(raw) as { id: string; type: string; data: { roomId?: string } };
  console.log('parly event', event.id, event.type, event.data.roomId);
  return Response.json({ ok: true });
}

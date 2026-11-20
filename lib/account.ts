import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { candidateAgentKey } from './roomViews.ts';

interface AccountParlyClient {
  deleteAgent?: (key: string) => Promise<unknown>;
  close?: (roomId: string) => Promise<unknown>;
}

const OPEN = (status: unknown) => status !== 'closed' && status !== 'agreed';

/**
 * Deletes everything that belongs only to `personId` and anonymises their side of shared rooms.
 * The caller must take `personId` from the signed session, never from the request.
 */
export async function deleteAccount(store: Firestore, personId: string, parlyClient: AccountParlyClient = {}): Promise<void> {
  const id = personId.trim();
  if (!id) throw new Error('Missing person');
  const now = new Date().toISOString();
  const profile = await store.collection('profiles').doc(id).get();
  const alias = profile.get('alias');

  // Rooms are shared with the other side, so blank this person's id instead of deleting the room.
  for (const [field, marker] of [['candidateId', 'candidateDeletedAt'], ['companyId', 'companyDeletedAt']] as const) {
    const rooms = await store.collection('talent_rooms').where(field, '==', id).get();
    for (const room of rooms.docs) {
      const open = OPEN(room.get('status'));
      if (open) await parlyClient.close?.(room.id).catch((error) => console.error('account delete: close room failed', error));
      await room.ref.update({
        [field]: '',
        [marker]: now,
        ...(open ? { status: 'closed', needsDecision: FieldValue.delete(), updatedAt: now } : {}),
      });
    }
  }

  const batch = store.batch();
  for (const col of ['profiles', 'talent_contacts', 'talent_email_challenges']) batch.delete(store.collection(col).doc(id));
  for (const [col, field] of [['talent_claims', 'personId'], ['talent_roles', 'companyId']] as const) {
    for (const doc of (await store.collection(col).where(field, '==', id).get()).docs) batch.delete(doc.ref);
  }
  await batch.commit();

  if (typeof alias === 'string' && alias) {
    await parlyClient.deleteAgent?.(candidateAgentKey(alias)).catch((error) => console.error('account delete: agent delete failed', error));
  }
}

/**
 * The delete route's logic, separated from cookies so it can be tested. Only reads the request's Origin header,
 * never its body: the person is always `session.sub`.
 */
export async function deleteSessionAccount(
  request: Request,
  session: { sub: string } | null | undefined,
  appOrigin: string,
  store: Firestore,
  parlyClient: AccountParlyClient,
): Promise<'forbidden' | 'signed_out' | 'deleted'> {
  if (request.headers.get('origin') !== appOrigin) return 'forbidden';
  if (!session) return 'signed_out';
  await deleteAccount(store, session.sub, parlyClient);
  return 'deleted';
}

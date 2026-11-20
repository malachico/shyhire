import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deleteAccount, deleteSessionAccount } from '../lib/account.ts';
import type { ParlyRoomsClient } from '../lib/roomViews.ts';
import { TalentRoomViews } from '../lib/roomViews.ts';
import { testDb } from '../lib/db.ts';

test('deleteAccount removes only the given person\'s data and anonymises their side of shared rooms', async () => {
  const db = testDb();
  const seed = async (id: string, alias: string) => {
    await db.collection('profiles').doc(id).set({ alias, searchable: true });
    await db.collection('talent_contacts').doc(id).set({ loginEmail: `${id}@example.com` });
    await db.collection('talent_email_challenges').doc(id).set({ email: `${id}@work.dev` });
    await db.collection('talent_claims').doc(`github:${id}`).set({ personId: id });
    await db.collection('talent_roles').doc(`role-${id}`).set({ companyId: id, companyName: 'acme.dev' });
  };
  await seed('alice', 'Candidate #aaaa1111');
  await seed('bob', 'Candidate #bbbb2222');
  const rooms = db.collection('talent_rooms');
  await rooms.doc('open-room').set({ candidateId: 'alice', candidateAlias: 'Candidate #aaaa1111', companyId: 'bob', companyName: 'acme.dev', status: 'needs_decision', needsDecision: { side: 'candidate' }, updatedAt: '2026-11-01T00:00:00.000Z' });
  await rooms.doc('agreed-room').set({ candidateId: 'bob', candidateAlias: 'Candidate #bbbb2222', companyId: 'alice', companyName: 'alice.dev', status: 'agreed', updatedAt: '2026-11-02T00:00:00.000Z' });
  await rooms.doc('bob-only').set({ candidateId: 'bob', companyId: 'carol', status: 'open' });

  const closed: string[] = [], deletedAgents: string[] = [];
  await deleteAccount(db, 'alice', {
    close: async (id) => { closed.push(id); },
    deleteAgent: async (key) => { deletedAgents.push(key); },
  });

  for (const col of ['profiles', 'talent_contacts', 'talent_email_challenges']) {
    assert.equal((await db.collection(col).doc('alice').get()).exists, false, col);
    assert.equal((await db.collection(col).doc('bob').get()).exists, true, col);
  }
  assert.equal((await db.collection('talent_claims').doc('github:alice').get()).exists, false);
  assert.equal((await db.collection('talent_claims').doc('github:bob').get()).exists, true);
  assert.equal((await db.collection('talent_roles').doc('role-alice').get()).exists, false);
  assert.equal((await db.collection('talent_roles').doc('role-bob').get()).exists, true);

  const open = (await rooms.doc('open-room').get()).data()!;
  assert.equal(open.candidateId, '');
  assert.equal(open.companyId, 'bob');
  assert.equal(open.status, 'closed');
  assert.equal(open.needsDecision, undefined);
  assert.ok(open.candidateDeletedAt);
  const agreed = (await rooms.doc('agreed-room').get()).data()!;
  assert.equal(agreed.companyId, '');
  assert.equal(agreed.candidateId, 'bob');
  assert.equal(agreed.status, 'agreed');
  assert.deepEqual((await rooms.doc('bob-only').get()).data(), { candidateId: 'bob', companyId: 'carol', status: 'open' });

  // Bob still sees both shared rooms, with nothing of Alice's but her alias and company name.
  const fake: ParlyRoomsClient = {
    getRoom: async (id) => ({ id, status: id === 'agreed-room' ? 'agreed' : 'closed' } as never),
    messages: async () => ({ messages: [] }),
    decide: async () => ({ ok: true }),
    approve: async () => ({ ok: true, agreed: false }),
  };
  const views = new TalentRoomViews(db, fake, undefined);
  const bobSees = JSON.stringify([await views.listConversations('bob'), await views.getRoomView('bob', 'open-room'), await views.getRoomView('bob', 'agreed-room')]);
  assert.match(bobSees, /open-room/);
  assert.match(bobSees, /agreed-room/);
  assert.doesNotMatch(bobSees, /alice@example\.com|alice@work\.dev|"alice"/);
  await assert.rejects(views.getRoomView('alice', 'open-room'));
  await assert.rejects(views.getRoomView('alice', 'agreed-room'));

  assert.deepEqual(closed, ['open-room']);
  assert.deepEqual(deletedAgents, ['cand-aaaa1111']);
  await assert.rejects(deleteAccount(db, '  '));
});

test('the delete route takes the person from the session only, and refuses other origins', async () => {
  const db = testDb();
  for (const id of ['alice', 'bob']) await db.collection('profiles').doc(id).set({ alias: `Candidate #${id}` });
  const exists = async (id: string) => (await db.collection('profiles').doc(id).get()).exists;
  const post = (origin: string) => new Request('https://app.test/talent/account/delete', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ personId: 'bob', sub: 'bob' }),
  });

  assert.equal(await deleteSessionAccount(post('https://evil.test'), { sub: 'alice' }, 'https://app.test', db, {}), 'forbidden');
  assert.equal(await deleteSessionAccount(post('https://app.test'), null, 'https://app.test', db, {}), 'signed_out');
  assert.ok(await exists('alice'));
  assert.ok(await exists('bob'));

  assert.equal(await deleteSessionAccount(post('https://app.test'), { sub: 'alice' }, 'https://app.test', db, {}), 'deleted');
  assert.equal(await exists('alice'), false);
  assert.ok(await exists('bob'), 'a body naming another person is ignored');
});

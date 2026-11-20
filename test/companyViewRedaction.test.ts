import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testDb } from '../lib/db.ts';
import type { Room, RoomMessage } from '../lib/parly.ts';
import { TalentRoomViews, type ParlyRoomsClient, type StoredTalentRoom } from '../lib/roomViews.ts';

describe('Company room view while blind', () => {
  it('blanks the candidate name, employer, links, emails and pay from what the company reads until agreed', async () => {
    const db = testDb();
    await db.collection('profiles').doc('gh-cand-redact').set({
      alias: 'Candidate #11223344',
      experience: [{ title: 'Engineer', company: 'Globex', start: '2019-01', end: '', description: '', hidden: false }],
      employerDomains: ['globex.io'],
      verified: [{ id: 'linkedin', source: 'linkedin', label: 'LinkedIn', verifiedAt: '2026-10-29T05:00:00.000Z', data: { name: 'Dana Reyes' } }],
    });
    const stored: StoredTalentRoom = {
      companyId: 'gh-comp-redact',
      companyName: 'acme.dev',
      candidateId: 'gh-cand-redact',
      candidateAlias: 'Candidate #11223344',
      brief: { role: 'Staff Engineer', comp: '', mustHaves: '' },
      status: 'needs_decision',
      createdAt: '2026-10-29T05:00:00.000Z',
      updatedAt: '2026-10-29T05:10:00.000Z',
    };
    await db.collection('talent_rooms').doc('room-redact').set(stored);

    const leak = 'Dana Reyes at Globex (globex.io, https://dana.example/cv, dana@globex.io) earns $180k, wants 180,000 or ₪30k/month';
    const room: Room = {
      id: 'room-redact',
      goal: `Goal: ${leak}`,
      status: 'needs_decision',
      sides: [{ ref: 'company', name: 'A verified company' }, { ref: 'candidate', name: 'Candidate #11223344' }],
      pending: [{ id: 'd1', sideRef: 'company', question: `Decide: ${leak}`, options: [`Offer ${leak}`, 'Pass'] }],
      document: { version: 1, text: `Summary: ${leak}`, approvals: {} },
    } as unknown as Room;
    const messages: RoomMessage[] = [{ id: 'm1', channel: 'table', from: 'Candidate #11223344 agent', at: '2026-10-29T05:01:00.000Z', text: `Message: ${leak}` }];
    const client: ParlyRoomsClient = {
      async getRoom() { return room; },
      async messages() { return { messages }; },
      async decide() { return { ok: true }; },
      async approve() { return { ok: true, agreed: false }; },
    };
    const views = new TalentRoomViews(db, client);

    const blind = await views.getRoomView('gh-comp-redact', 'room-redact');
    assert.equal(blind.viewerSide, 'company');
    const seen = JSON.stringify([blind.goal, blind.document?.text, blind.needsDecision, blind.messages.map((m) => m.text)]);
    assert.doesNotMatch(seen, /Dana|Reyes|Globex|globex\.io|https?:|dana\.example|@globex|180|30k/i);
    assert.match(blind.messages[0]!.text, /^Message: /);
    assert.equal(blind.needsDecision?.options[1], 'Pass');
    assert.equal(blind.candidateAlias, 'Candidate #11223344');
    assert.equal(blind.messages[0]!.from, 'Candidate #11223344 agent');

    room.status = 'agreed';
    room.pending = [];
    await db.collection('talent_rooms').doc('room-redact').update({ status: 'agreed' });
    const agreed = await views.getRoomView('gh-comp-redact', 'room-redact');
    assert.equal(agreed.goal, `Goal: ${leak}`);
    assert.equal(agreed.document?.text, `Summary: ${leak}`);
    assert.equal(agreed.messages[0]!.text, `Message: ${leak}`);
  });
});

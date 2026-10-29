import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testDb } from '../lib/db.ts';
import type { Room, RoomMessage } from '../lib/parly.ts';
import { TalentRoomViews, type ParlyRoomsClient, type StoredTalentRoom } from '../lib/roomViews.ts';

function fakeParlyClient(initialRooms: Record<string, { room: Room; messagesBySide: Record<string, RoomMessage[]> }>) {
  const decisions: { roomId: string; decisionId: string; choice: string }[] = [];
  const approvals: { roomId: string; side: string; version: number }[] = [];
  const client: ParlyRoomsClient = {
    async getRoom(roomId) {
      const entry = initialRooms[roomId];
      if (!entry) throw new Error(`Missing room ${roomId}`);
      return entry.room;
    },
    async messages(roomId, side) {
      const entry = initialRooms[roomId];
      return { messages: entry?.messagesBySide[side] ?? [] };
    },
    async decide(roomId, decisionId, choice) {
      decisions.push({ roomId, decisionId, choice });
      return { ok: true };
    },
    async approve(roomId, side, version) {
      approvals.push({ roomId, side, version });
      const entry = initialRooms[roomId];
      if (entry?.room.document && entry.room.document.version === version) {
        entry.room.document.approvals[side] = { version, at: '2026-10-29T06:00:00.000Z' };
      }
      const agreed = Boolean(
        entry?.room.document &&
        entry.room.document.approvals.company?.version === version &&
        entry.room.document.approvals.candidate?.version === version,
      );
      if (agreed && entry) entry.room.status = 'agreed';
      return { ok: true, agreed };
    },
  };
  return { client, decisions, approvals };
}

describe('Talent company rooms (C) and candidate requests (D)', () => {
  it('lists company rooms and candidate requests ordered by updatedAt desc without leaking private fields or the other side decision', async () => {
    const db = testDb();
    const col = db.collection('talent_rooms');
    const r1: StoredTalentRoom = {
      companyId: 'gh-company-1',
      companyName: 'acme.dev',
      candidateId: 'gh-candidate-secret-1',
      candidateAlias: 'Candidate #a1b2c3d4',
      brief: { role: 'Senior Backend Engineer', comp: '$180k–$210k', mustHaves: 'Go, Postgres' },
      status: 'needs_decision',
      needsDecision: { side: 'candidate', question: 'Would you relocate to NYC?', options: ['Yes', 'Remote only'] },
      documentVersion: 1,
      createdAt: '2026-10-29T05:00:00.000Z',
      updatedAt: '2026-10-29T05:10:00.000Z',
    };
    const r2: StoredTalentRoom = {
      companyId: 'gh-company-1',
      companyName: 'acme.dev',
      candidateId: 'gh-candidate-secret-2',
      candidateAlias: 'Candidate #e5f6a7b8',
      brief: { role: 'Staff Distributed Systems', comp: '$220k', mustHaves: 'Rust, Raft' },
      status: 'needs_decision',
      needsDecision: { side: 'company', question: 'Can the role be 100% remote in EU?', options: ['Yes', 'No'] },
      documentVersion: 2,
      createdAt: '2026-10-29T05:05:00.000Z',
      updatedAt: '2026-10-29T05:20:00.000Z',
    };
    await col.doc('room-1').set(r1);
    await col.doc('room-2').set(r2);

    const { client } = fakeParlyClient({});
    const views = new TalentRoomViews(db, client);

    const companyRooms = await views.listCompanyRooms('gh-company-1');
    assert.deepEqual(companyRooms.map((r) => r.id), ['room-2', 'room-1']);
    assert.equal(companyRooms[0]!.needsDecision?.question, 'Can the role be 100% remote in EU?');
    assert.equal(companyRooms[1]!.waitingOn, 'candidate');
    assert.equal(companyRooms[1]!.needsDecision, undefined);
    assert.doesNotMatch(JSON.stringify(companyRooms), /gh-candidate-secret|relocate to NYC/);

    const candidateReqs = await views.listCandidateRequests('gh-candidate-secret-1');
    assert.deepEqual(candidateReqs.map((r) => r.id), ['room-1']);
    assert.equal(candidateReqs[0]!.companyName, 'acme.dev');
    assert.equal(candidateReqs[0]!.needsDecision?.question, 'Would you relocate to NYC?');
    assert.doesNotMatch(JSON.stringify(candidateReqs), /180k|210k|Go, Postgres|gh-company-1/);

    const candidate2Reqs = await views.listCandidateRequests('gh-candidate-secret-2');
    assert.equal(candidate2Reqs[0]!.waitingOn, 'company');
    assert.equal(candidate2Reqs[0]!.needsDecision, undefined);
    assert.doesNotMatch(JSON.stringify(candidate2Reqs), /100% remote in EU|220k|Rust, Raft/);
  });

  it('derives side strictly from companyId/candidateId for live room view, decide, and approve, and blocks strangers', async () => {
    const db = testDb();
    await db.collection('talent_rooms').doc('room-live').set({
      companyId: 'gh-comp',
      companyName: 'stripe.dev',
      candidateId: 'gh-cand',
      candidateAlias: 'Candidate #11223344',
      brief: { role: 'Payments Engineer', comp: '$200k', mustHaves: 'Go, Distributed Systems' },
      status: 'needs_decision',
      needsDecision: { side: 'candidate', question: 'Confirm start date window?', options: ['Within 30 days', '60 days'] },
      documentVersion: 1,
      createdAt: '2026-10-29T05:00:00.000Z',
      updatedAt: '2026-10-29T05:10:00.000Z',
    } satisfies StoredTalentRoom);

    const { client, decisions, approvals } = fakeParlyClient({
      'room-live': {
        room: {
          id: 'room-live',
          status: 'needs_decision',
          goal: 'Check fit for Payments Engineer at stripe.dev',
          sides: [
            { ref: 'company', name: 'stripe.dev' },
            { ref: 'candidate', name: 'Candidate #11223344' },
          ],
          document: {
            version: 1,
            text: 'Strong Go + payments fit. Remote US.',
            approvals: {},
          },
          pending: [{ decisionId: 'candidate', sideRef: 'candidate', question: 'Confirm start date window?', options: ['Within 30 days', '60 days'] }],
        },
        messagesBySide: {
          company: [
            { id: 'm1', channel: 'shared', from: 'stripe.dev agent', at: '2026-10-29T05:01:00.000Z', text: 'Let us check distributed systems experience.' },
            { id: 'm2', channel: 'corner', from: 'stripe.dev agent', at: '2026-10-29T05:02:00.000Z', text: 'Company private note' },
          ],
          candidate: [
            { id: 'm1', channel: 'shared', from: 'stripe.dev agent', at: '2026-10-29T05:01:00.000Z', text: 'Let us check distributed systems experience.' },
            { id: 'm3', channel: 'corner', from: 'Candidate #11223344 agent', at: '2026-10-29T05:03:00.000Z', text: 'Candidate private corner question' },
          ],
        },
      },
    });
    const views = new TalentRoomViews(db, client);

    // Stranger cannot view, decide, or approve
    await assert.rejects(views.getRoomView('gh-stranger', 'room-live'), /Room not found/);
    await assert.rejects(views.decide('gh-stranger', 'room-live', 'Within 30 days'), /Room not found/);
    await assert.rejects(views.approve('gh-stranger', 'room-live', 1), /Room not found/);

    // Company view sees brief and company corner, but NOT candidateId, candidate corner, or candidate decision question
    const compView = await views.getRoomView('gh-comp', 'room-live');
    assert.equal(compView.viewerSide, 'company');
    assert.equal(compView.brief?.role, 'Payments Engineer');
    assert.equal(compView.waitingOn, 'candidate');
    assert.equal(compView.needsDecision, undefined);
    assert.doesNotMatch(JSON.stringify(compView), /gh-cand|Confirm start date window|Candidate private corner/);

    // Candidate view sees candidate decision and candidate corner, but NOT company brief or company corner
    const candView = await views.getRoomView('gh-cand', 'room-live');
    assert.equal(candView.viewerSide, 'candidate');
    assert.equal(candView.brief, undefined);
    assert.equal(candView.needsDecision?.question, 'Confirm start date window?');
    assert.doesNotMatch(JSON.stringify(candView), /200k|Distributed Systems|Company private note|gh-comp/);

    // Company cannot answer a decision waiting on the candidate
    await assert.rejects(views.decide('gh-comp', 'room-live', 'Forged answer'), /No decision is waiting on your side/);

    // Candidate answers decision -> derives 'candidate' side and clears needsDecision in Firestore
    await views.decide('gh-cand', 'room-live', 'Within 30 days');
    assert.deepEqual(decisions, [{ roomId: 'room-live', decisionId: 'candidate', choice: 'Within 30 days' }]);

    // Both sides approve -> derives 'company' and 'candidate' respectively and marks room agreed
    const app1 = await views.approve('gh-comp', 'room-live', 1);
    assert.equal(app1.agreed, false);
    const app2 = await views.approve('gh-cand', 'room-live', 1);
    assert.equal(app2.agreed, true);
    assert.deepEqual(approvals, [
      { roomId: 'room-live', side: 'company', version: 1 },
      { roomId: 'room-live', side: 'candidate', version: 1 },
    ]);
    const finalRooms = await views.listCompanyRooms('gh-comp');
    assert.equal(finalRooms[0]!.status, 'agreed');
  });
});



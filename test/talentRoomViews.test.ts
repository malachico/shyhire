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

  it('A: opens a room with opaque refs, enforces work-email and employer-domain blocks, and stores talent_rooms/{parlyRoomId}', async () => {
    const db = testDb();
    const { Profiles } = await import('../lib/profiles.ts');
    const profiles = new Profiles(db);

    const company = { id: 'gh-company-open', kind: 'human' as const };
    const candidate = { id: 'gh-candidate-open', kind: 'human' as const };
    const blockedCandidate = { id: 'gh-candidate-blocked', kind: 'human' as const };

    const savedCand = await profiles.save(candidate, {
      version: 0,
      headline: 'Backend engineer Go PostgreSQL',
      openTo: 'Remote backend engineer',
      preferences: 'Minimum $190k base; remote US only',
      employerDomains: ['current-job.test'],
      experience: [{ title: 'Backend engineer', company: 'Current Job', description: 'Go and PostgreSQL', start: '2021', end: '2025' }],
    });
    const savedBlocked = await profiles.save(blockedCandidate, {
      version: 0,
      headline: 'Backend engineer Go',
      employerDomains: ['acme.test'],
    });

    const createdAgents: { key: string; name: string }[] = [];
    const openedPayloads: { goal: string; sides: { ref: string; name: string; brief: string; agent: string }[] }[] = [];
    const { client } = fakeParlyClient({});
    client.createAgent = async (key, name) => {
      createdAgents.push({ key, name });
      return { key, name };
    };
    client.openRoom = async (body) => {
      openedPayloads.push(body);
      return { id: 'parly-room-99', status: 'talking' };
    };

    const views = new TalentRoomViews(db, client);

    await assert.rejects(
      views.openRoom(company, { candidateAlias: savedCand.alias, brief: { role: 'Senior Go Engineer', comp: '$200k', mustHaves: 'Go, Postgres' } }),
      /Verify your work email/,
    );

    await profiles.verify(company.id, {
      id: 'work-email:sub.acme.test',
      source: 'work-email',
      label: 'Work email verified',
      verifiedAt: '2026-10-29T05:00:00.000Z',
      data: { domain: 'sub.acme.test' },
    });

    await assert.rejects(
      views.openRoom(company, { candidateAlias: savedBlocked.alias, brief: { role: 'Senior Go Engineer', comp: '$200k', mustHaves: 'Go' } }),
      /Candidate not found/,
    );

    const opened = await views.openRoom(company, {
      candidateAlias: savedCand.alias,
      brief: { role: 'Senior Go Engineer', comp: '$200k', mustHaves: 'Go, PostgreSQL' },
    });
    assert.deepEqual(opened, { id: 'parly-room-99', status: 'talking' });
    assert.equal(createdAgents.length, 2);
    assert.equal(openedPayloads.length, 1);
    const sent = openedPayloads[0]!;
    assert.equal(sent.sides[0]!.ref, 'company');
    assert.equal(sent.sides[0]!.name, 'sub.acme.test');
    assert.match(sent.sides[0]!.brief, /Senior Go Engineer/);
    assert.equal(sent.sides[1]!.ref, 'candidate');
    assert.equal(sent.sides[1]!.name, savedCand.alias);
    assert.match(sent.sides[1]!.brief, /Minimum \$190k base/);
    assert.doesNotMatch(JSON.stringify(sent), /gh-company-open|gh-candidate-open/);

    const stored = (await db.collection('talent_rooms').doc('parly-room-99').get()).data() as StoredTalentRoom;
    assert.equal(stored.companyId, 'gh-company-open');
    assert.equal(stored.companyName, 'sub.acme.test');
    assert.equal(stored.candidateId, 'gh-candidate-open');
    assert.equal(stored.candidateAlias, savedCand.alias);
    assert.equal(stored.status, 'talking');
  });

  it('B & E: processes webhook events idempotently on event.id and reveals contact details only when status is agreed', async () => {
    const db = testDb();
    const { Profiles } = await import('../lib/profiles.ts');
    const profiles = new Profiles(db);

    await profiles.recordContact('gh-comp-e', { githubLogin: 'acme-cto', workEmail: 'cto@acme.io', domain: 'acme.io' });
    await profiles.recordContact('gh-cand-e', { githubLogin: 'jane-systems', workEmail: 'jane@work.example', domain: 'work.example' });

    await db.collection('talent_rooms').doc('room-webhook-1').set({
      companyId: 'gh-comp-e',
      companyName: 'acme.io',
      candidateId: 'gh-cand-e',
      candidateAlias: 'Candidate #feedcafe',
      brief: { role: 'Systems Architect', comp: '$240k', mustHaves: 'Rust' },
      status: 'talking',
      createdAt: '2026-10-29T05:00:00.000Z',
      updatedAt: '2026-10-29T05:00:00.000Z',
    } satisfies StoredTalentRoom);

    const liveRooms: Record<string, { room: Room; messagesBySide: Record<string, RoomMessage[]> }> = {
      'room-webhook-1': {
        room: {
          id: 'room-webhook-1',
          status: 'talking',
          goal: 'Evaluate fit',
          sides: [
            { ref: 'company', name: 'acme.io' },
            { ref: 'candidate', name: 'Candidate #feedcafe' },
          ],
          pending: [],
        },
        messagesBySide: { company: [], candidate: [] },
      },
    };
    const { client } = fakeParlyClient(liveRooms);
    const views = new TalentRoomViews(db, client);

    const beforeComp = await views.getRoomView('gh-comp-e', 'room-webhook-1');
    const beforeCand = await views.getRoomView('gh-cand-e', 'room-webhook-1');
    assert.equal(beforeComp.revealedContact, undefined);
    assert.equal(beforeCand.revealedContact, undefined);
    assert.doesNotMatch(JSON.stringify(beforeComp), /jane-systems|jane@work\.example/);
    assert.doesNotMatch(JSON.stringify(beforeCand), /acme-cto|cto@acme\.io/);

    const first = await views.handleWebhookEvent({
      id: 'evt_dec_1',
      type: 'room.needs_decision',
      data: { roomId: 'room-webhook-1', side: 'candidate', question: 'Confirm notice period?', options: ['2 weeks', '4 weeks'] },
    });
    assert.deepEqual(first, { ok: true });
    const dup = await views.handleWebhookEvent({
      id: 'evt_dec_1',
      type: 'room.needs_decision',
      data: { roomId: 'room-webhook-1', side: 'company', question: 'Mutated duplicate should be ignored', options: ['No'] },
    });
    assert.deepEqual(dup, { ok: true, duplicate: true });

    let snap = (await db.collection('talent_rooms').doc('room-webhook-1').get()).data() as StoredTalentRoom;
    assert.equal(snap.status, 'needs_decision');
    assert.equal(snap.needsDecision?.side, 'candidate');
    assert.equal(snap.needsDecision?.question, 'Confirm notice period?');
    assert.equal(snap.lastEventId, 'evt_dec_1');

    await views.handleWebhookEvent({
      id: 'evt_doc_2',
      type: 'room.document_updated',
      data: { roomId: 'room-webhook-1', version: 3 },
    });
    snap = (await db.collection('talent_rooms').doc('room-webhook-1').get()).data() as StoredTalentRoom;
    assert.equal(snap.status, 'talking');
    assert.equal(snap.documentVersion, 3);
    assert.equal(snap.needsDecision, undefined);

    const replayOld = await views.handleWebhookEvent({
      id: 'evt_dec_1',
      type: 'room.stuck',
      data: { roomId: 'room-webhook-1' },
    });
    assert.deepEqual(replayOld, { ok: true, duplicate: true });

    await views.handleWebhookEvent({
      id: 'evt_agreed_3',
      type: 'room.agreed',
      data: { roomId: 'room-webhook-1', version: 3 },
    });
    liveRooms['room-webhook-1']!.room.status = 'agreed';

    const afterComp = await views.getRoomView('gh-comp-e', 'room-webhook-1');
    assert.equal(afterComp.status, 'agreed');
    assert.equal(afterComp.revealedContact?.side, 'candidate');
    assert.equal(afterComp.revealedContact?.githubLogin, 'jane-systems');
    assert.equal(afterComp.revealedContact?.email, 'jane@work.example');

    const afterCand = await views.getRoomView('gh-cand-e', 'room-webhook-1');
    assert.equal(afterCand.status, 'agreed');
    assert.equal(afterCand.revealedContact?.side, 'company');
    assert.equal(afterCand.revealedContact?.displayName, 'acme.io');
    assert.equal(afterCand.revealedContact?.githubLogin, 'acme-cto');
    assert.equal(afterCand.revealedContact?.email, 'cto@acme.io');
  });

  it('sends split private preferences (salary, locations + workModes, noGos) as separate lines in the candidate brief', async () => {
    const db = testDb();
    const { Profiles } = await import('../lib/profiles.ts');
    const profiles = new Profiles(db);

    const companySub = 'google-sub-company-split';
    const candidateSub = 'google-sub-candidate-split';

    await profiles.verify(companySub, {
      id: 'work-email:hiring.io',
      source: 'work-email',
      label: 'Work email verified',
      verifiedAt: '2026-10-29T05:00:00.000Z',
      data: { domain: 'hiring.io' },
    });

    const savedCand = await profiles.save(candidateSub, {
      version: 0,
      headline: 'Staff Backend Engineer',
      about: 'Go, PostgreSQL, Kubernetes',
      openTo: 'Staff backend engineering',
      salary: { min: 195000, currency: 'USD' },
      locations: ['New York', 'London'],
      workModes: ['remote', 'hybrid'],
      noGos: 'No ad-tech or heavy travel',
      experience: [
        { title: 'Backend Engineer', company: 'PrivateCo', start: '2019-01', end: '2024-01', description: 'Go and PostgreSQL', hidden: false },
      ],
    });

    const openedCalls: { goal: string; sides: { ref: string; name: string; brief: string; agent: string }[] }[] = [];
    const { client } = fakeParlyClient({});
    client.createAgent = async (key, name) => ({ key, name });
    client.openRoom = async (body) => {
      openedCalls.push(body);
      return { id: 'parly-room-split', status: 'talking' };
    };

    const views = new TalentRoomViews(db, client);
    await views.openRoom(companySub, {
      candidateAlias: savedCand.alias,
      brief: { role: 'Staff Go Engineer', comp: '$190k–$220k', mustHaves: 'Go, Postgres' },
    });

    assert.equal(openedCalls.length, 1);
    const candSide = openedCalls[0]!.sides.find((s) => s.ref === 'candidate')!;
    const briefLines = candSide.brief.split('\n');
    assert.equal(briefLines.includes('Salary: minimum 195000 USD (private: never share the number)'), true);
    assert.equal(briefLines.includes('Locations: New York, London · remote, hybrid'), true);
    assert.equal(briefLines.includes('No-gos: No ad-tech or heavy travel'), true);
    assert.doesNotMatch(candSide.brief, /google-sub-candidate-split|PrivateCo/);
  });
});

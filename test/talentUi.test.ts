import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { privacyLeaks, redact } from '../lib/privacy.ts';
import { normalizeProfile } from '../lib/profiles.ts';
import { candidateBrief } from '../lib/roomViews.ts';
import { testDb } from '../lib/db.ts';
import { homeOf, parseMode } from '../lib/modes.ts';
import { Profiles } from '../lib/profiles.ts';
import { TalentRoomViews, type ParlyRoomsClient, type StoredTalentRoom } from '../lib/roomViews.ts';
import { filterSort, statusOf, type Filter, type Sort } from '../lib/status.ts';

const room = (over: Partial<StoredTalentRoom> = {}): StoredTalentRoom => ({
  companyId: 'g-company', companyName: 'acme.dev', candidateId: 'g-cand', candidateAlias: 'Candidate #a1b2c3d4',
  brief: { role: 'Backend', comp: '', mustHaves: '' }, status: 'talking',
  createdAt: '2026-10-29T05:00:00.000Z', updatedAt: '2026-10-29T05:00:00.000Z', ...over,
} as StoredTalentRoom);

describe('Shyhire UI support', () => {
  it('a paused candidate is not found in search or for a new room, and saving keeps the pause', async () => {
    const db = testDb();
    const profiles = new Profiles(db);
    const company = { id: 'g-co-pause', kind: 'human' as const };
    const cand = { id: 'g-cand-pause', kind: 'human' as const };
    const saved = await profiles.save(cand, { version: 0, headline: 'Backend engineer Go PostgreSQL', experience: [{ title: 'Backend engineer', company: 'X', description: 'Go and PostgreSQL', start: '2020', end: '2025' }] });
    await profiles.verify(company.id, { id: 'work-email:acme.dev', source: 'work-email', label: 'Work email verified', verifiedAt: '2026-10-29T05:00:00.000Z', data: { domain: 'acme.dev' } });
    assert.equal((await profiles.search(company, 'Go backend')).profiles.length, 1);

    await profiles.setPaused(cand, true);
    assert.equal((await profiles.search(company, 'Go backend')).profiles.length, 0);
    const views = new TalentRoomViews(db, { getRoom: async () => { throw new Error('no'); }, messages: async () => ({ messages: [] }), decide: async () => ({ ok: true }), approve: async () => ({ ok: true, agreed: false }), openRoom: async () => ({ id: 'r', status: 'talking' }) });
    await assert.rejects(views.openRoom(company, { candidateAlias: saved.alias, brief: { role: 'Backend', comp: '', mustHaves: '' } }), /Candidate not found/);

    const again = await profiles.save(cand, { version: (await profiles.mine(cand)).version, headline: 'Backend engineer Go PostgreSQL Kubernetes' });
    assert.equal(again.paused, true, 'a save must not resume matching');
    await profiles.setPaused(cand, false);
    assert.equal((await profiles.search(company, 'Go backend')).profiles.length, 1);
  });

  it('pass closes the room on Parly for either side and marks it ended; strangers get not_found', async () => {
    const db = testDb();
    const closed: string[] = [];
    const client: ParlyRoomsClient = { getRoom: async () => { throw new Error('unused'); }, messages: async () => ({ messages: [] }), decide: async () => ({ ok: true }), approve: async () => ({ ok: true, agreed: false }), close: async (id) => { closed.push(id); return { ok: true }; } };
    await db.collection('talent_rooms').doc('room-pass').set(room());
    const views = new TalentRoomViews(db, client);
    await assert.rejects(views.pass('g-stranger', 'room-pass'));
    assert.deepEqual(closed, []);
    await views.pass('g-cand', 'room-pass');
    assert.deepEqual(closed, ['room-pass']);
    assert.equal((await db.collection('talent_rooms').doc('room-pass').get()).data()!.status, 'closed');
  });

  it('lists both sides in one Conversations list, waiting-on-me first, and knows when I already approved', async () => {
    const db = testDb();
    const col = db.collection('talent_rooms');
    await col.doc('hiring-old').set(room({ companyId: 'g-me', candidateId: 'g-x', updatedAt: '2026-10-29T05:00:00.000Z' }));
    await col.doc('offer-asks').set(room({ companyId: 'g-y', candidateId: 'g-me', status: 'needs_decision', needsDecision: { side: 'candidate', question: 'Remote?', options: ['Yes'] }, updatedAt: '2026-10-29T04:00:00.000Z' }));
    const client: ParlyRoomsClient = { getRoom: async () => { throw new Error('unused'); }, messages: async () => ({ messages: [] }), decide: async () => ({ ok: true }), approve: async () => ({ ok: true, agreed: false }) };
    const views = new TalentRoomViews(db, client);
    const rows = await views.listConversations('g-me');
    assert.deepEqual(rows.map((r) => [r.id, r.side, r.title, r.needsMe]), [['offer-asks', 'candidate', 'A verified company', true], ['hiring-old', 'company', 'Candidate #a1b2c3d4', false]]);
    assert.equal(await views.waitingCount('g-me'), 1);

    await col.doc('hiring-old').set({ documentVersion: 2 }, { merge: true });
    await views.approve('g-me', 'hiring-old', 2);
    const after = (await views.listConversations('g-me')).find((r) => r.id === 'hiring-old')!;
    assert.equal(after.iApproved, true);
    assert.equal(statusOf(after.status, { summaryReady: true, iApproved: after.iApproved }).label, 'Agreed: waiting for their approval');
  });

  it('maps room states to plain-language outcomes and filter buckets', () => {
    const at = (...args: Parameters<typeof statusOf>) => { const { label, bucket } = statusOf(...args); return [label, bucket]; };
    assert.deepEqual(at('talking'), ['Talking', 'talking']);
    assert.deepEqual(at('needs_decision', { needsMe: true }), ['Needs your decision', 'needs_me']);
    assert.deepEqual(at('needs_decision'), ['Waiting on the other side', 'talking']);
    assert.deepEqual(at('talking', { summaryReady: true }), ['Agreed: waiting for your approval', 'needs_me']);
    assert.deepEqual(at('talking', { summaryReady: true, iApproved: true }), ['Agreed: waiting for their approval', 'agreed']);
    assert.deepEqual(at('talking', { theyDecide: true, summaryReady: true }), ['Waiting on the other side', 'talking']);
    assert.deepEqual(at('agreed', { summaryReady: true, iApproved: true }), ['Agreed: contact details shared', 'agreed']);
    assert.deepEqual(at('closed', { needsMe: true }), ['Closed: not a fit', 'ended']);
    assert.deepEqual(at('stuck'), ["Stuck: the agents couldn't agree", 'ended']);
  });

  it('filters conversations by state and sorts by last updated or needs-me first', () => {
    const rows = [
      { id: 'old-needs', bucket: 'needs_me' as const, updatedAt: '2026-10-01T00:00:00.000Z' },
      { id: 'new-talk', bucket: 'talking' as const, updatedAt: '2026-10-03T00:00:00.000Z' },
      { id: 'mid-closed', bucket: 'ended' as const, updatedAt: '2026-10-02T00:00:00.000Z' },
    ];
    const ids = (f: Filter, s: Sort) => filterSort(rows, f, s).map((r) => r.id);
    assert.deepEqual(ids('all', 'updated'), ['new-talk', 'mid-closed', 'old-needs']);
    assert.deepEqual(ids('all', 'needs_me'), ['old-needs', 'new-talk', 'mid-closed']);
    assert.deepEqual(ids('ended', 'updated'), ['mid-closed']);
    assert.deepEqual(ids('agreed', 'updated'), []);
    assert.deepEqual(rows.map((r) => r.id), ['old-needs', 'new-talk', 'mid-closed']);
  });

  it('checking a profile reports what saving would refuse, and neither saves nor lists the candidate', async () => {
    const profiles = new Profiles(testDb());
    let published = 0;
    profiles.onChange = async () => { published++; };
    const cand = { id: 'g-cand-check', kind: 'human' as const };
    const role = { title: 'Backend engineer', company: 'Acme', description: 'Go', start: '2020', end: '2025' };
    await assert.rejects(profiles.save(cand, { version: 0, headline: 'Backend engineer', facts: [{ text: 'Built payments at Acme' }], experience: [role] }, {}, true), /mentions Acme/);
    assert.equal((await profiles.save(cand, { version: 0, headline: 'Backend engineer', facts: [{ text: 'Built payments in Go' }], experience: [role] }, {}, true)).headline, 'Backend engineer');
    const stored = await profiles.mine(cand);
    assert.equal(stored.version, 0);
    assert.equal(stored.headline, '');
    assert.notEqual(stored.searchable, true);
    assert.equal(published, 0);
  });

  it('warns about a name, email, link or blocked employer in the candidate text', () => {
    const me = { name: 'Dana Levi', email: 'dana@gmail.com' };
    assert.deepEqual(privacyLeaks('Backend engineer, Go', me, ['acme.com']), []);
    assert.deepEqual(privacyLeaks('I am Dana, see https://x.dev or mail dana@gmail.com. Built Acme payments.', me, ['acme.com']), ['your name', 'an email address', 'a link', 'acme.com']);
    assert.deepEqual(privacyLeaks('a great team', me, ['a.io']), [], 'short domain words are not matched alone');
  });

  it("the candidate's agent is never told their employers, links or emails", () => {
    assert.equal(redact('Led payments at Acme Corp (acme.com), see https://x.dev or dana@acme.com', ['Acme Corp', 'acme.com']), 'Led payments at [employer] ([employer]), see [link] or [email]');
    assert.equal(redact('Academic work', ['acme.com']), 'Academic work', 'only whole words');
    const brief = candidateBrief(normalizeProfile('p1', {
      experience: [{ id: 'r1', title: 'Senior engineer at Globex', company: 'Globex', start: '2020', end: '', description: 'Built Globex billing; blog at https://dana.dev', hidden: false, source: 'self' }],
      openTo: 'Remote, not Initech', employerDomains: ['initech.com'], salary: { min: 200000, currency: 'USD' },
      noGos: 'No calls from globex.com, email me at dana@x.io, ask for Dana',
      verified: [{ id: 'linkedin', source: 'linkedin', label: 'LinkedIn account', verifiedAt: '2026-01-01', data: { name: 'Dana Levi' } }], details: { industries: [], skills: [], languages: [], certifications: [], leadership: 'Led 8 engineers at Globex' },
    }));
    assert.doesNotMatch(brief, /Globex|globex|Initech|dana\.dev|dana@x\.io|Dana/);
    assert.match(brief, /Senior engineer at \[employer\]/);
  });

  it('sign-in mode is only work or hire, and each has a fixed home', () => {
    assert.equal(parseMode('hire'), 'hire');
    for (const v of ['work', '', undefined, 'https://evil.example', '/admin']) assert.equal(parseMode(v), 'work');
    assert.equal(homeOf('hire'), '/talent/search');
    assert.equal(homeOf('work'), '/talent/profile');
  });
});

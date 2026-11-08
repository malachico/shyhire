import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testDb } from '../lib/db.ts';
import { Profiles } from '../lib/profiles.ts';
import { candidateAgentKey, TalentRoomViews, type ParlyRoomsClient } from '../lib/roomViews.ts';
import { createProfiles } from '../lib/talent.ts';

const client = () => {
  const agents = new Map<string, { name: string; instructions: string; card?: string; listed?: boolean }>();
  const opened: { sides: { ref: string; brief: string; agent: string }[]; metadata?: Record<string, string> }[] = [];
  const c: ParlyRoomsClient = {
    getRoom: async () => { throw new Error('unused'); }, messages: async () => ({ messages: [] }),
    decide: async () => ({ ok: true }), approve: async () => ({ ok: true, agreed: false }),
    createAgent: async (key, name) => ({ key, name }),
    putAgent: async (key, agent) => { agents.set(key, agent); return { key, name: agent.name }; },
    openRoom: async (body) => { opened.push(body); return { id: `room-${opened.length}`, status: 'talking' }; },
  };
  return { c, agents, opened };
};

describe("Candidates' own Parly agents", () => {
  it('follow the profile: private brief in instructions, facts as the card, unlisted while paused; rooms use them', async () => {
    const db = testDb(), profiles = new Profiles(db), { c, agents, opened } = client(), views = new TalentRoomViews(db, c);
    profiles.onChange = async (p) => { await views.syncCandidate(p); };
    const cand = { id: 'cand-own', kind: 'human' as const };
    const saved = await profiles.save(cand, { version: 0, headline: 'Go engineer', facts: ['Built a payments ledger in Go'], salary: { min: 200000, currency: 'USD' }, noGos: 'No gambling', experience: [{ title: 'Backend engineer', company: 'SecretCo', start: '2020', end: '', description: 'Go' }] });
    const agent = agents.get(candidateAgentKey(saved.alias))!;
    assert.equal(agent.listed, true);
    assert.match(agent.card!, /Built a payments ledger in Go/);
    assert.doesNotMatch(agent.card!, /200000|gambling/);
    assert.match(agent.instructions, /200000/); assert.match(agent.instructions, /No gambling/);
    assert.doesNotMatch(agent.instructions + agent.card, /SecretCo/);

    await profiles.setPaused(cand, true);
    assert.equal(agents.get(candidateAgentKey(saved.alias))!.listed, false);
    await profiles.setPaused(cand, false);

    const company = { id: 'co-own', kind: 'human' as const };
    await profiles.verify(company.id, { id: 'work-email:acme.test', source: 'work-email', label: 'w', verifiedAt: new Date().toISOString(), data: { domain: 'acme.test' } });
    const roleId = '6f1c0b9e-4a6e-4d55-9a3c-1b2f3e4d5c6b';
    await views.openRoom(company, { candidateAlias: saved.alias, roleId, brief: { role: 'Go engineer', comp: '$190k' } });
    const side = opened[0]!.sides.find((s) => s.ref === 'candidate')!;
    assert.equal(side.agent, candidateAgentKey(saved.alias));
    assert.equal(side.brief, '');
    assert.deepEqual(opened[0]!.metadata, { role_id: roleId });
    assert.equal((await db.collection('talent_rooms').doc('room-1').get()).data()!.roleId, roleId);
  });

  it('AI search keeps who a company may see: never paused, never blocked, never itself; keeps the why', async () => {
    const db = testDb(), profiles = new Profiles(db);
    const mk = async (id: string, extra: Record<string, unknown> = {}) => profiles.save({ id, kind: 'human' }, { version: 0, headline: 'Go engineer', facts: ['Go'], ...extra });
    const ok = await mk('s-ok'), blocked = await mk('s-blocked', { employerDomains: ['acme.test'] }), paused = await mk('s-paused');
    await profiles.setPaused({ id: 's-paused', kind: 'human' }, true);
    await profiles.verify('s-co', { id: 'work-email:acme.test', source: 'work-email', label: 'w', verifiedAt: new Date().toISOString(), data: { domain: 'acme.test' } });
    profiles.agentSearch = async () => [ok, blocked, paused].map((p, i) => ({ key: candidateAgentKey(p.alias), score: 90 - i, why: `why ${i}` }));
    const found = await profiles.search({ id: 's-co', kind: 'human' }, 'Senior backend in Go, payments');
    assert.deepEqual(found.profiles.map((p) => [p.alias, p.why, p.score]), [[ok.alias, 'why 0', 90]]);
    profiles.agentSearch = async () => { throw new Error('hub down'); };
    assert.deepEqual((await profiles.search({ id: 's-co', kind: 'human' }, 'Go')).profiles.map((p) => p.alias), [ok.alias]);
  });
});

describe('Standing roles', () => {
  it('opens conversations with good fits only, never twice, and tops up daily', async () => {
    const { Roles, MIN_FIT } = await import('../lib/roles.ts');
    const db = testDb(), profiles = new Profiles(db), { c, opened } = client(), views = new TalentRoomViews(db, c);
    const cands = [];
    for (const id of ['r-a', 'r-b', 'r-c']) cands.push(await profiles.save({ id, kind: 'human' }, { version: 0, headline: 'Go', facts: ['Go engineer'] }));
    const co = { id: 'r-co', kind: 'human' as const };
    await profiles.verify(co.id, { id: 'work-email:acme.test', source: 'work-email', label: 'w', verifiedAt: new Date().toISOString(), data: { domain: 'acme.test' } });
    let scores = [90, MIN_FIT - 1, 75];
    profiles.agentSearch = async () => cands.map((p, i) => ({ key: candidateAgentKey(p.alias), score: scores[i]!, why: '' }));
    const roles = new Roles(profiles, views, db);
    await assert.rejects(roles.create({ id: 'r-a', kind: 'human' }, { title: 'Go', looking: 'Go' }), /Verify your work email/);
    const { role, opened: first } = await roles.create(co, { title: 'Senior Go engineer', looking: 'Payments, remote EU', comp: '$190k' });
    assert.equal(first, 2);
    assert.deepEqual(opened.map((o) => o.metadata?.role_id), [role.id, role.id]);
    scores = [90, 90, 90];
    assert.equal(await roles.fill(role.id, 3), 1); // only the one not contacted yet
    assert.equal(await roles.fill(role.id, 3), 0);
    assert.deepEqual((await roles.fillAll()).roles, 0); // filled within the day
    const [view] = await roles.list(co);
    assert.equal(view!.stats.total, 3); assert.equal(view!.stats.talking, 3);
    await roles.setStatus(co, role.id, 'paused');
    assert.equal(await roles.fill(role.id, 3), 0);
    await assert.rejects(roles.setStatus({ id: 'r-a', kind: 'human' }, role.id, 'open'), /No such role/);
  });

  it('carries location and work mode into the search and the company brief, and only the owner edits a role', async () => {
    const { Roles } = await import('../lib/roles.ts');
    const db = testDb(), profiles = new Profiles(db), { c, opened } = client(), views = new TalentRoomViews(db, c);
    const cand = await profiles.save({ id: 'l-a', kind: 'human' }, { version: 0, headline: 'Go', facts: ['Go engineer'] });
    const co = { id: 'l-co', kind: 'human' as const }, other = { id: 'l-other', kind: 'human' as const };
    await profiles.verify(co.id, { id: 'work-email:acme.test', source: 'work-email', label: 'w', verifiedAt: new Date().toISOString(), data: { domain: 'acme.test' } });
    const queries: string[] = [];
    profiles.agentSearch = async (q) => { queries.push(q); return [{ key: candidateAgentKey(cand.alias), score: 90, why: '' }]; };
    const roles = new Roles(profiles, views, db);
    await assert.rejects(roles.create(co, { title: 'Go', looking: 'Go', workModes: ['moon'] }), /workModes/);
    const { role } = await roles.create(co, { title: 'Go engineer', looking: 'Payments', location: 'Tel Aviv, acme.test HQ', workModes: ['onsite', 'hybrid'] });
    assert.match(queries[0]!, /Tel Aviv.*hybrid.*onsite/);
    const brief = opened[0]!.sides.find((s) => s.ref === 'company')!.brief;
    assert.match(brief, /Location: Tel Aviv, \[employer\] HQ/);
    assert.match(brief, /Work mode: hybrid, onsite/);

    const edit = { title: 'Staff Go engineer', looking: 'Payments', location: 'Haifa', workModes: ['remote'], comp: '', mustHaves: '' };
    await assert.rejects(roles.update(other, role.id, edit), /No such role/);
    await assert.rejects(roles.update(co, role.id, { ...edit, title: '' }), /role title/);
    await roles.update(co, role.id, edit);
    const [view] = await roles.list(co);
    assert.equal(view!.title, 'Staff Go engineer'); assert.equal(view!.location, 'Haifa'); assert.deepEqual(view!.workModes, ['remote']);
    assert.equal(view!.contacted.length, 1); // what's already started stays
  });

  it('Talk opens one room about a role the recruiter owns, from the stored role, and never a second room', async () => {
    const { Roles } = await import('../lib/roles.ts');
    const db = testDb(), profiles = new Profiles(db), { c, opened } = client(), views = new TalentRoomViews(db, c);
    const [a, b, d] = await Promise.all(['t-a', 't-b', 't-d'].map((id) => profiles.save({ id, kind: 'human' }, { version: 0, headline: 'Go', facts: ['Go engineer'] })));
    const co = { id: 't-co', kind: 'human' as const }, other = { id: 't-other', kind: 'human' as const };
    for (const [who, domain] of [[co, 'acme.test'], [other, 'other.test']] as const) await profiles.verify(who.id, { id: `work-email:${domain}`, source: 'work-email', label: 'w', verifiedAt: new Date().toISOString(), data: { domain } });
    profiles.agentSearch = async () => [];
    const roles = new Roles(profiles, views, db);
    const { role } = await roles.create(co, { title: 'Go engineer', looking: 'Payments', comp: '$190k', mustHaves: 'Visa', location: 'Haifa', workModes: ['remote'] });
    await assert.rejects(roles.talk(other, role.id, a!.alias), /No such role/);
    assert.equal(opened.length, 0);

    await roles.setStatus(co, role.id, 'paused'); // Choosing a paused role is still the recruiter's call.
    const room = await roles.talk(co, role.id, a!.alias);
    assert.equal(opened.length, 1);
    assert.deepEqual(opened[0]!.metadata, { role_id: role.id });
    assert.match(opened[0]!.sides.find((s) => s.ref === 'company')!.brief, /Go engineer[\s\S]*Haifa/);
    assert.deepEqual((await roles.list(co))[0]!.contacted, [a!.alias]);
    assert.deepEqual(await roles.talk(co, role.id, a!.alias), room); // A stale page or a double click.
    assert.equal(opened.length, 1);

    await roles.setStatus(co, role.id, 'closed');
    assert.deepEqual((await roles.list(co)).map((r) => r.status), ['closed']); // Closed stays visible to its owner.
    await assert.rejects(roles.talk(co, role.id, b!.alias), /closed/);

    // A new role from Talk: its first fill finds the same candidate, who still gets one room.
    profiles.agentSearch = async () => [b!, d!].map((p) => ({ key: candidateAgentKey(p.alias), score: 90, why: '' }));
    const made = await roles.create(co, { title: 'Staff Go engineer', looking: 'Payments' }, b!.alias);
    assert.deepEqual(opened.slice(1).map((o) => o.sides.find((s) => s.ref === 'candidate')!.name), [b!.alias, d!.alias]);
    assert.equal(made.opened, 1);
    assert.ok(made.room);
    assert.deepEqual([...(await roles.list(co))[0]!.contacted].sort(), [b!.alias, d!.alias].sort());
    assert.deepEqual((await roles.list(co)).map((r) => r.status), ['open', 'closed']); // Closed last.

    // Nothing started, so no role stays behind for a retry to double.
    await assert.rejects(roles.create(co, { title: 'Ghost', looking: 'Payments' }, 'Candidate #00000000'), /candidate|not found|No such/i);
    assert.equal((await roles.list(co)).filter((r) => r.status !== 'closed').length, 1);
    // The conversation exists even if the extra search fails.
    const failing = Object.assign(Object.create(profiles), { search: async () => { throw new Error('search down'); } }) as Profiles;
    const late = await profiles.save({ id: 't-e', kind: 'human' }, { version: 0, headline: 'Go', facts: ['Go engineer'] });
    const { room: kept, opened: extra } = await new Roles(failing, views, db).create(co, { title: 'Late', looking: 'Payments' }, late.alias);
    assert.ok(kept); assert.equal(extra, 0);
  });

  it('opens with the longest role the form accepts', async () => {
    const { Roles } = await import('../lib/roles.ts');
    const db = testDb(), profiles = new Profiles(db), { c, opened } = client(), views = new TalentRoomViews(db, c);
    const cand = await profiles.save({ id: 'm-a', kind: 'human' }, { version: 0, headline: 'Go', facts: ['Go engineer'] });
    const co = { id: 'm-co', kind: 'human' as const };
    await profiles.verify(co.id, { id: 'work-email:acme.test', source: 'work-email', label: 'w', verifiedAt: new Date().toISOString(), data: { domain: 'acme.test' } });
    profiles.agentSearch = async () => [{ key: candidateAgentKey(cand.alias), score: 90, why: '' }];
    const { opened: n } = await new Roles(profiles, views, db).create(co, { title: 'Go', looking: 'x'.repeat(2000), mustHaves: 'y'.repeat(2000) });
    assert.equal(n, 1); assert.equal(opened.length, 1);
  });

  it('reads a pasted job description into form fields, keeping only what the form accepts', async () => {
    const { Roles } = await import('../lib/roles.ts');
    const db = testDb(), fetched: string[] = [];
    const reply = { title: 'Go engineer', looking: 'x'.repeat(3000), location: 'Haifa', workModes: ['hybrid', 'moon'], comp: 7, mustHaves: 'Visa', extra: 'dropped' };
    const profiles = createProfiles(db, {
      accessToken: async () => 'test-token',
      fetchImpl: (async (_url: string, init: RequestInit) => {
        fetched.push(String(init.body));
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }));
      }) as typeof fetch,
    });
    const roles = new Roles(profiles, new TalentRoomViews(db, client().c), db);
    const me = { id: 'd-co', kind: 'human' as const };
    await assert.rejects(roles.readDescription(me, 'Acme wants a Go engineer'), /Verify your work email/);
    assert.equal(fetched.length, 0);
    await profiles.verify(me.id, { id: 'work-email:acme.test', source: 'work-email', label: 'w', verifiedAt: new Date().toISOString(), data: { domain: 'acme.test' } });
    await assert.rejects(roles.readDescription(me, ' '), /Paste the job description/);
    await assert.rejects(roles.readDescription(me, 'x'.repeat(40001)), /at most 40000/);
    const draft = await roles.readDescription(me, 'Acme wants a Go engineer');
    assert.deepEqual(draft, { title: 'Go engineer', looking: 'x'.repeat(2000), location: 'Haifa', workModes: ['hybrid'], comp: '', mustHaves: 'Visa' });
    assert.match(fetched[0]!, /Acme wants a Go engineer/);
    assert.match(fetched[0]!, /untrusted data/);
    assert.match(fetched[0]!, /never include the company name/);
    for (let i = 0; i < 4; i++) await roles.readDescription(me, 'again');
    await assert.rejects(roles.readDescription(me, 'too many'), { code: 'rate_limited' });
    await assert.rejects(new Roles(new Profiles(db), new TalentRoomViews(db, client().c), db).readDescription(me, 'text'), { code: 'unsupported' });
  });

  it('a failed search opens nobody and leaves lastFillAt alone, so the daily cron retries', async () => {
    const { Roles } = await import('../lib/roles.ts');
    const db = testDb(), profiles = new Profiles(db), { c } = client(), views = new TalentRoomViews(db, c);
    const co = { id: 'd-co', kind: 'human' as const };
    await profiles.verify(co.id, { id: 'work-email:acme.test', source: 'work-email', label: 'w', verifiedAt: new Date().toISOString(), data: { domain: 'acme.test' } });
    profiles.agentSearch = async () => { throw new Error('hub down'); };
    const roles = new Roles(profiles, views, db);
    const { role } = await roles.create(co, { title: 'Senior Go engineer', looking: 'Payments, remote EU' });
    assert.equal((await db.collection('talent_roles').doc(role.id).get()).data()!.lastFillAt, undefined);
    assert.equal(await roles.fill(role.id, 3), 0);
    assert.equal((await db.collection('talent_roles').doc(role.id).get()).data()!.lastFillAt, undefined);
    // Search recovers: the role fills on the next attempt and only then stamps lastFillAt.
    profiles.agentSearch = async () => [];
    assert.equal(await roles.fill(role.id, 3), 0);
    assert.notEqual((await db.collection('talent_roles').doc(role.id).get()).data()!.lastFillAt, undefined);
  });
});

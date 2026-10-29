import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testDb } from '../lib/db.ts';
import { Profiles } from '../lib/profiles.ts';
import { candidateAgentKey, TalentRoomViews, type ParlyRoomsClient } from '../lib/roomViews.ts';

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
    assert.deepEqual(opened[0]!.metadata, { roleId });
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
    assert.deepEqual(opened.map((o) => o.metadata?.roleId), [role.id, role.id]);
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
});

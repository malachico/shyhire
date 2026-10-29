import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { testDb } from '../lib/db.ts';
import { Composio, TalentLinkedIn, type ToolAccount } from '../lib/linkedin.ts';
import { professionalDraft, Profiles } from '../lib/profiles.ts';
import { createProfiles, profiles as defaultProfiles } from '../lib/talent.ts';

function testPerson(name = 'Owner') {
  const id = `person-${randomUUID().slice(0, 8)}`;
  return { id, name, kind: 'human' as const, email: `${id}@people.test` };
}

const privateDraft = {
  headline: 'Private Name Senior engineer at Secret Employer https://identity.test',
  about: 'Call private@example.test. Python and TypeScript',
  experience: [{ id: 'private-name', title: 'Senior Backend Engineer at Secret Employer', company: 'Secret Employer', start: '2020-01', end: '2024-01', description: 'Private Name built Python and React https://identity.test', hidden: false, source: 'self' as const }],
};

describe('Talent professional profile generation', () => {
  it('wires vertexProfileImporter + firestoreLlmMeter by default in createProfiles/profiles(), generates a reviewable draft and persists only professional facts after approval', async () => {
    assert.equal(typeof defaultProfiles().importer, 'function');
    const db = testDb(), person = testPerson();
    const profiles = createProfiles(db, {
      accessToken: async () => 'test-token',
      fetchImpl: (async () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(privateDraft) }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
      }))) as typeof fetch,
    });
    const draft = await profiles.draft(person, { text: 'Private Name original CV private@example.test' });
    assert.equal(draft.headline.includes('Backend engineer'), true);
    assert.equal(draft.about.includes('Senior'), true);
    assert.doesNotMatch(JSON.stringify(draft), /Private Name|Secret Employer|private@|https|identity.test/);
    const usage = await db.collection('talent_llm_usage').get();
    assert.equal(usage.size, 1);
    assert.equal(usage.docs[0]!.data().personId, person.id);
    assert.equal((await profiles.mine(person)).version, 0);
    const saved = await profiles.save(person, { version: 0, ...privateDraft, preferences: 'Remote only', openTo: 'Backend roles' });
    const record = (await db.collection('profiles').doc(person.id).get()).data()!;
    assert.doesNotMatch(JSON.stringify(record), /Private Name|Secret Employer|private@|https|identity.test|private-name/);
    assert.equal(saved.preferences, 'Remote only'); assert.equal(saved.openTo, 'Backend roles');
    assert.equal(saved.experience[0]!.source, 'self');
    assert.equal(saved.publicSummary.includes('4 full years'), true);
  });

  it('uses verified GitHub technologies without fabricating experience or retaining identifiers', async () => {
    const db = testDb(), profiles = new Profiles(db), person = testPerson();
    await profiles.verify(person.id, { id: 'github', source: 'github', label: 'Private Name', verifiedAt: new Date().toISOString(), data: { login: 'PrivateName', repositories: ['identifying-repo'], languages: ['Python', 'Private Employer'], mergedPublicPullRequests: 7 } });
    const draft = await profiles.draft(person, {});
    assert.equal(draft.headline.includes('Python'), true); assert.deepEqual(draft.experience, []);
    assert.doesNotMatch(JSON.stringify(await profiles.mine(person)), /PrivateName|identifying-repo|Private Employer/);
    assert.doesNotMatch(draft.about, /employer|Senior|years/);
    const unavailable = await profiles.draft(testPerson(), {});
    assert.deepEqual(unavailable.experience, []);
  });

  it('processes PDFs transiently, validates their signature/size and saves no file', async () => {
    const db = testDb(), profiles = new Profiles(db), person = testPerson();
    const calls: [string, { text?: string; pdf?: Buffer }][] = [];
    profiles.importer = async (id, input) => { calls.push([id, input]); return privateDraft; };
    const pdf = Buffer.from('%PDF-1.4 candidate document');
    await profiles.draft(person, { pdf: pdf.toString('base64') });
    assert.deepEqual(calls[0], [person.id, { pdf }]);
    assert.equal((await db.collection('files').get()).empty, true);
    assert.equal((await db.collection('profiles').get()).empty, true);
    await assert.rejects(profiles.draft(person, { pdf: Buffer.from('not PDF').toString('base64') }), /PDF/);
    await assert.rejects(profiles.draft(person, { pdf: 'a'.repeat(4 * 1024 * 1024 + 1) }), /3 MB/);
    await assert.rejects(profiles.draft(person, { text: 'x', pdf: pdf.toString('base64') }), /or one PDF/);
  });

  it('does not invent duration from invalid dates or trust browser verification fields', async () => {
    const draft = professionalDraft({ ...privateDraft, experience: [{ ...privateDraft.experience[0]!, end: 'private employer date' }], verified: [] });
    assert.equal(draft.about.includes('full years'), false);
    const profiles = new Profiles(testDb()), person = testPerson();
    await assert.rejects(profiles.save(person, { version: 0, verified: [{ source: 'linkedin' }] }), /editable/);
  });
});

describe('Talent LinkedIn account connection', () => {
  function fixture() {
    const db = testDb(), profiles = new Profiles(db);
    let nextAccounts: ToolAccount[] | undefined;
    let nextExecute: { ok: boolean; data?: unknown } | undefined;
    const accountCalls: string[] = [];
    const executeCalls: [string, string, Record<string, unknown>, string | undefined][] = [];
    const connectCalls: [string, string, string][] = [];
    const composio = {
      accounts: async (id: string) => {
        accountCalls.push(id);
        if (nextAccounts) { const out = nextAccounts; nextAccounts = undefined; return out; }
        return [{ id: 'candidate-account', toolkit: 'linkedin', status: 'ACTIVE', authConfigId: 'dedicated-config' }];
      },
      execute: async (id: string, slug: string, args: Record<string, unknown>, accountId?: string) => {
        executeCalls.push([id, slug, args, accountId]);
        if (nextExecute) { const out = nextExecute; nextExecute = undefined; return out; }
        return { ok: true, data: { response_dict: { sub: 'private-subject', name: 'Private Name', email: 'private@example.test' } } };
      },
      connectWithConfig: async (id: string, cfg: string, cb: string) => {
        connectCalls.push([id, cfg, cb]);
        return 'https://connect.example.test';
      },
    };
    const linkedin = new TalentLinkedIn(db, profiles, composio, Buffer.alloc(32, 7), 'dedicated-config', 'https://talent.parly.dev');
    return {
      db, profiles, composio, linkedin, accountCalls, executeCalls, connectCalls,
      mockAccountsOnce: (items: ToolAccount[]) => { nextAccounts = items; },
      mockExecuteOnce: (res: { ok: boolean; data?: unknown }) => { nextExecute = res; },
    };
  }

  it('uses a dedicated auth config, fixed callback and owner/account-bound self-profile call', async () => {
    const { db, profiles, linkedin, accountCalls, executeCalls, connectCalls } = fixture();
    const person = testPerson();
    await linkedin.connect(person, 'a'.repeat(48));
    assert.deepEqual(connectCalls[0], [person.id, 'dedicated-config', `https://talent.parly.dev/talent/auth/linkedin/callback?state=${'a'.repeat(48)}`]);
    await linkedin.verify(person);
    assert.equal(accountCalls.includes(person.id), true);
    assert.deepEqual(executeCalls[0], [person.id, 'LINKEDIN_GET_MY_INFO', {}, 'candidate-account']);
    const profile = await profiles.mine(person);
    assert.deepEqual(profile.verified[0]!.data, {});
    assert.doesNotMatch(JSON.stringify(profile), /private-subject|Private Name|private@/);
    const identities = await db.collection('talent_linkedin_identities').get();
    assert.match(identities.docs[0]!.id, /^[a-f0-9]{64}$/);
    assert.deepEqual(identities.docs[0]!.data(), { personId: person.id });
  });

  it('atomically rejects another profile claiming the same provider subject', async () => {
    const { db, linkedin } = fixture();
    const one = testPerson(), two = testPerson();
    const results = await Promise.allSettled([linkedin.verify(one), linkedin.verify(two)]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await db.collection('talent_linkedin_identities').get()).size, 1);
    assert.equal((await db.collection('profiles').get()).size, 1);
  });

  it('fails closed for bots, unrelated configs, inactive accounts and malformed responses', async () => {
    const { profiles, linkedin, mockAccountsOnce, mockExecuteOnce } = fixture();
    const person = testPerson(), bot = { id: 'bot-1', kind: 'bot' };
    await assert.rejects(linkedin.verify(bot), /People/);
    await assert.rejects(linkedin.connect(person, 'bad'), /state/);
    mockAccountsOnce([{ id: 'wrong', toolkit: 'linkedin', status: 'ACTIVE', authConfigId: 'broad-social-config' }]);
    await assert.rejects(linkedin.verify(person), /Connect/);
    mockAccountsOnce([{ id: 'old', toolkit: 'linkedin', status: 'EXPIRED', authConfigId: 'dedicated-config' }]);
    await assert.rejects(linkedin.verify(person), /Connect/);
    mockExecuteOnce({ ok: true, data: { response_dict: { sub: '', name: 'Private Name', email: '' } } });
    await assert.rejects(linkedin.verify(person), /confirm/);
    assert.deepEqual((await profiles.mine(person)).verified, []);
  });

  it('forwards the explicit config/account without changing generic Composio calls', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([String(url), init]);
      return new Response(JSON.stringify(
        String(url).includes('connected_accounts/link') ? { redirect_url: 'https://connect.example.test' }
        : String(url).includes('connected_accounts?') ? { items: [{ id: 'candidate-account', toolkit: { slug: 'linkedin' }, status: 'ACTIVE', auth_config: { id: 'dedicated-config' } }] }
        : { successful: true, data: { response_dict: { sub: 'subject' } } },
      ));
    };
    const composio = new Composio('key', fetcher as typeof fetch);
    await composio.connectWithConfig('owner', 'dedicated-config', 'https://talent.parly.dev/callback');
    assert.equal(JSON.parse(String(calls[0]![1]!.body)).auth_config_id, 'dedicated-config');
    assert.equal((await composio.accounts('owner'))[0]!.authConfigId, 'dedicated-config');
    await composio.execute('owner', 'LINKEDIN_GET_MY_INFO', {}, 'candidate-account');
    assert.deepEqual(JSON.parse(String(calls[2]![1]!.body)), { user_id: 'owner', arguments: {}, connected_account_id: 'candidate-account' });
  });
});


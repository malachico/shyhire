import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { testDb } from '../lib/db.ts';
import { TalentGitHub } from '../lib/github.ts';
import {
  LINKEDIN_AUTHORIZE_URL,
  LINKEDIN_CALLBACK_PATH,
  LINKEDIN_SCOPES,
  LINKEDIN_TOKEN_URL,
  LINKEDIN_USERINFO_URL,
  TalentLinkedIn,
} from '../lib/linkedin.ts';
import { Profiles } from '../lib/profiles.ts';
import { createProfiles } from '../lib/talent.ts';

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
  it('wires vertexProfileImporter + firestoreLlmMeter by default when configured, wraps token failures in TalentError(unavailable), generates a reviewable draft and persists only professional facts after approval', async () => {
    const db = testDb(), person = testPerson();
    const unconfigured = createProfiles(db);
    assert.equal(unconfigured.importer, undefined);
    const brokenToken = createProfiles(db, {
      accessToken: async () => { throw new Error('missing WIF'); },
    });
    await assert.rejects(brokenToken.draft(person, { text: 'CV text' }), { code: 'unavailable', status: 503 });
    const profiles = createProfiles(db, {
      accessToken: async () => 'test-token',
      fetchImpl: (async () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(privateDraft) }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
      }))) as typeof fetch,
    });
    const draft = await profiles.draft(person, { text: 'Private Name original CV private@example.test' });
    assert.equal(draft.headline, privateDraft.headline);
    assert.equal(draft.about, privateDraft.about);
    const usage = await db.collection('talent_llm_usage').get();
    assert.equal(usage.size, 1);
    assert.equal(usage.docs[0]!.data().personId, person.id);
    assert.equal((await profiles.mine(person)).version, 0);
    const saved = await profiles.save(person, { version: 0, ...privateDraft, preferences: 'Remote only', openTo: 'Backend roles' });
    assert.equal(saved.preferences, 'Remote only'); assert.equal(saved.openTo, 'Backend roles');
    assert.equal(saved.experience[0]!.source, 'self');
    assert.equal(saved.publicSummary.includes('4 full years'), true);
  });

  it('has the AI write what companies see from the profile and verified data, and flags what would identify them', async () => {
    const db = testDb(), profiles = new Profiles(db), person = testPerson();
    await profiles.verify(person.id, { id: 'github', source: 'github', label: 'Private Name', verifiedAt: new Date().toISOString(), data: { login: 'PrivateName', repositories: ['identifying-repo'], languages: ['Python'], mergedPublicPullRequests: 7 } });
    await profiles.verify(person.id, { id: 'linkedin', source: 'linkedin', label: 'x', verifiedAt: new Date().toISOString(), data: { name: 'Jane Private', email: 'jane@example.test', sub: 'li-1' } }, undefined, 'li-1');
    const seen: Record<string, unknown>[] = [];
    profiles.summarizer = async (_id, data) => { seen.push(data); return 'Jane is a senior Python engineer with 7 merged public PRs.'; };
    const result = await profiles.summarize(person, { headline: 'Python engineer', experience: privateDraft.experience });
    assert.match(result.summary, /senior Python/);
    assert.deepEqual(result.leaks, ['your name']);
    const sent = JSON.stringify(seen[0]);
    assert.match(sent, /Python engineer/); assert.match(sent, /mergedPublicPullRequests/);
    assert.doesNotMatch(sent, /"company"|PrivateName|identifying-repo|Jane Private|jane@example/);
    const draft = await profiles.draft(person, {});
    assert.equal(draft.publicSummary, 'Jane is a senior Python engineer with 7 merged public PRs.');
    assert.deepEqual(draft.experience, []);
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

  it('does not trust browser verification fields', async () => {
    const profiles = new Profiles(testDb()), person = testPerson();
    await assert.rejects(profiles.save(person, { version: 0, verified: [{ source: 'linkedin' }] }), /editable/);
  });
});

describe('Talent LinkedIn OpenID Connect account connection', () => {
  it('builds the OIDC authorize URL, exchanges code for userinfo, records a LinkedIn account verification (name and email), and keeps name/email out of publicSummary and search', async () => {
    const db = testDb();
    const profiles = new Profiles(db);
    const person = testPerson();
    const calls: [string, RequestInit | undefined][] = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([String(url), init]);
      if (String(url) === LINKEDIN_TOKEN_URL) {
        return new Response(JSON.stringify({ access_token: 'SECRET_LINKEDIN_TOKEN', id_token: 'jwt' }));
      }
      if (String(url) === LINKEDIN_USERINFO_URL) {
        assert.equal((init?.headers as Record<string, string>)?.authorization, 'Bearer SECRET_LINKEDIN_TOKEN');
        return new Response(
          JSON.stringify({
            sub: 'linkedin-sub-782bbtaQ',
            name: 'Jane Candidate',
            email: 'Jane.Candidate@Example.test',
            email_verified: true,
          }),
        );
      }
      throw new Error(`Unexpected URL: ${String(url)}`);
    };
    const linkedin = new TalentLinkedIn(
      { clientId: 'li-client-id', clientSecret: 'li-client-secret', webUrl: 'https://talent.parly.dev/' },
      fetcher as typeof fetch,
    );
    const authUrl = new URL(linkedin.authorizeUrl('state-token-123'));
    assert.equal(`${authUrl.origin}${authUrl.pathname}`, LINKEDIN_AUTHORIZE_URL);
    assert.equal(authUrl.searchParams.get('response_type'), 'code');
    assert.equal(authUrl.searchParams.get('client_id'), 'li-client-id');
    assert.equal(authUrl.searchParams.get('redirect_uri'), `https://talent.parly.dev${LINKEDIN_CALLBACK_PATH}`);
    assert.equal(authUrl.searchParams.get('state'), 'state-token-123');
    assert.equal(authUrl.searchParams.get('scope'), LINKEDIN_SCOPES);

    const account = await linkedin.exchange('valid-auth-code');
    const tokenParams = new URLSearchParams(String(calls[0]![1]?.body));
    assert.equal(tokenParams.get('grant_type'), 'authorization_code');
    assert.equal(tokenParams.get('code'), 'valid-auth-code');
    assert.equal(tokenParams.get('client_id'), 'li-client-id');
    assert.equal(tokenParams.get('client_secret'), 'li-client-secret');
    assert.equal(tokenParams.get('redirect_uri'), `https://talent.parly.dev${LINKEDIN_CALLBACK_PATH}`);

    assert.equal(account.sub, 'linkedin-sub-782bbtaQ');
    assert.equal(account.name, 'Jane Candidate');
    assert.equal(account.email, 'jane.candidate@example.test');
    assert.equal(account.verification.source, 'linkedin');
    assert.equal(account.verification.label, 'LinkedIn account');
    assert.deepEqual(account.verification.data, {
      name: 'Jane Candidate',
      email: 'jane.candidate@example.test',
    });
    assert.doesNotMatch(JSON.stringify(account), /SECRET_LINKEDIN_TOKEN/);

    await profiles.save(person, {
      version: 0,
      headline: 'Senior Backend Engineer',
      about: 'Go and PostgreSQL',
      experience: [{ title: 'Backend Engineer', company: 'Acme', start: '2021-01', end: '2024-01', description: 'Go and PostgreSQL', hidden: false }],
    });
    await profiles.verify(person.id, account.verification);
    const mine = await profiles.mine(person);
    const liVer = mine.verified.find((v) => v.source === 'linkedin');
    assert.ok(liVer);
    assert.equal(liVer.label, 'LinkedIn account');
    assert.deepEqual(liVer.data, { name: 'Jane Candidate', email: 'jane.candidate@example.test' });
    assert.match(mine.publicSummary, /LinkedIn account verified\./);
    assert.doesNotMatch(mine.publicSummary, /Jane Candidate|jane\.candidate|example\.test|linkedin-sub/);

    const searcher = testPerson('Recruiter');
    await profiles.verify(searcher.id, {
      id: 'work-email:hiring-co.test',
      source: 'work-email',
      label: 'Work email verified',
      verifiedAt: new Date().toISOString(),
      data: { domain: 'hiring-co.test' },
    });
    const search = await profiles.search(searcher, 'Go');
    assert.equal(search.profiles.length, 1);
    assert.equal(search.profiles[0]!.badges.includes('linkedin'), true);
    assert.doesNotMatch(JSON.stringify(search), /Jane Candidate|jane\.candidate|example\.test|linkedin-sub/);
  });

  it('fails closed on invalid codes, token exchange errors, missing sub, or unverified email', async () => {
    const badToken = new TalentLinkedIn(
      { clientId: 'id', clientSecret: 'secret', webUrl: 'https://talent.parly.dev' },
      (async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })) as typeof fetch,
    );
    await assert.rejects(badToken.exchange(''), /Invalid LinkedIn/);
    await assert.rejects(badToken.exchange('code'), /LinkedIn connection failed/);

    const missingSub = new TalentLinkedIn(
      { clientId: 'id', clientSecret: 'secret', webUrl: 'https://talent.parly.dev' },
      (async (url: string | URL | Request) =>
        String(url) === LINKEDIN_TOKEN_URL
          ? new Response(JSON.stringify({ access_token: 'tok' }))
          : new Response(JSON.stringify({ sub: '', name: 'Test' }))) as typeof fetch,
    );
    await assert.rejects(missingSub.exchange('code'), /invalid identity/);

    const unverifiedEmail = new TalentLinkedIn(
      { clientId: 'id', clientSecret: 'secret', webUrl: 'https://talent.parly.dev' },
      (async (url: string | URL | Request) =>
        String(url) === LINKEDIN_TOKEN_URL
          ? new Response(JSON.stringify({ access_token: 'tok' }))
          : new Response(JSON.stringify({ sub: 'li-sub-1', given_name: 'Alex', family_name: 'Dev', email: 'unverified@example.test', email_verified: false }))) as typeof fetch,
    );
    const identity = await unverifiedEmail.exchange('code');
    assert.equal(identity.name, 'Alex Dev');
    assert.equal(identity.email, undefined);
    assert.deepEqual(identity.verification.data, { name: 'Alex Dev' });

    const missingVerifiedFlag = new TalentLinkedIn(
      { clientId: 'id', clientSecret: 'secret', webUrl: 'https://talent.parly.dev' },
      (async (url: string | URL | Request) =>
        String(url) === LINKEDIN_TOKEN_URL
          ? new Response(JSON.stringify({ access_token: 'tok' }))
          : new Response(JSON.stringify({ sub: 'li-sub-2', name: 'Alex Dev', email: 'missing@example.test' }))) as typeof fetch,
    );
    const missingFlagIdentity = await missingVerifiedFlag.exchange('code');
    assert.equal(missingFlagIdentity.email, undefined);
    assert.deepEqual(missingFlagIdentity.verification.data, { name: 'Alex Dev' });
  });

  it('atomically rejects another profile claiming the same provider subject for both LinkedIn and GitHub', async () => {
    const db = testDb();
    const profiles = new Profiles(db);

    const linkedin = new TalentLinkedIn(
      { clientId: 'id', clientSecret: 'secret', webUrl: 'https://talent.parly.dev' },
      (async (url: string | URL | Request) =>
        String(url) === LINKEDIN_TOKEN_URL
          ? new Response(JSON.stringify({ access_token: 'li-tok' }))
          : new Response(JSON.stringify({ sub: 'linkedin-sub-shared', name: 'Shared LinkedIn', email: 'shared@example.test', email_verified: true }))) as typeof fetch,
    );
    const liIdentity = await linkedin.exchange('li-code');
    const liOne = testPerson('LI One');
    const liTwo = testPerson('LI Two');
    // The first profile claims the account; a second is refused (the claim is read and written in one transaction).
    await profiles.verify(liOne.id, liIdentity.verification);
    await assert.rejects(profiles.verify(liTwo.id, liIdentity.verification), /This LinkedIn account is already connected to another profile/);
    const liClaim = await db.collection('talent_claims').doc('linkedin:linkedin-sub-shared').get();
    assert.equal((liClaim.data() as { personId: string }).personId, liOne.id);
    const liWinnerId = liOne.id;
    // Reconnecting with the same person succeeds
    await profiles.verify(liWinnerId, liIdentity.verification);
    const liLoserId = liWinnerId === liOne.id ? liTwo.id : liOne.id;
    await assert.rejects(
      profiles.verify(liLoserId, liIdentity.verification),
      { code: 'conflict', message: 'This LinkedIn account is already connected to another profile' },
    );

    const github = new TalentGitHub(
      { clientId: 'gh-id', clientSecret: 'gh-secret', webUrl: 'https://talent.parly.dev' },
      (async (url: string | URL | Request) => {
        if (String(url).includes('access_token')) return new Response(JSON.stringify({ access_token: 'gh-tok' }));
        if (String(url).endsWith('/user')) return new Response(JSON.stringify({ id: 4242, login: 'shared-gh' }));
        return new Response(
          JSON.stringify({
            data: {
              viewer: {
                repositories: { totalCount: 2, nodes: [{ languages: { nodes: [{ name: 'TypeScript' }] } }] },
                contributionsCollection: { restrictedContributionsCount: 5 },
              },
              search: { issueCount: 3 },
            },
          }),
        );
      }) as typeof fetch,
    );
    const ghIdentity = await github.exchange('gh-code', 'v'.repeat(43));
    const ghOne = testPerson('GH One');
    const ghTwo = testPerson('GH Two');
    // The first profile claims the account; a second is refused (the claim is read and written in one transaction).
    await profiles.verify(ghOne.id, ghIdentity.verification);
    await assert.rejects(profiles.verify(ghTwo.id, ghIdentity.verification), /This GitHub account is already connected to another profile/);
    const ghClaim = await db.collection('talent_claims').doc('github:4242').get();
    assert.equal((ghClaim.data() as { personId: string }).personId, ghOne.id);
    const ghWinnerId = ghOne.id;
    // Reconnecting with the same person succeeds
    await profiles.verify(ghWinnerId, ghIdentity.verification);
    const ghLoserId = ghWinnerId === ghOne.id ? ghTwo.id : ghOne.id;
    await assert.rejects(
      profiles.verify(ghLoserId, ghIdentity.verification),
      { code: 'conflict', message: 'This GitHub account is already connected to another profile' },
    );
  });
});


import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it, mock } from 'node:test';
import { createFirestore, DEFAULT_GCP_PROJECT_ID, testDb } from '../lib/db.ts';
import { githubProfileQuery, TalentGitHub } from '../lib/github.ts';
import { GOOGLE_CALLBACK_PATH, TalentGoogle } from '../lib/google.ts';
import { Profiles, publicSummary, vertexProfileImporter, wire, type LlmMeter } from '../lib/profiles.ts';

function testPerson(name = 'Owner') {
  const id = `person-${randomUUID().slice(0, 8)}`;
  return { id, name, kind: 'human' as const, email: `${id}@people.test` };
}

const verification = { id: 'work', source: 'work-email' as const, label: 'Current employer verified', verifiedAt: new Date().toISOString(), data: { domain: 'private-employer.test' } };

describe('Talent owner profiles', () => {
  it('preserves preferences privately and rejects forged fields, stale edits and bots', async () => {
    const profiles = new Profiles(testDb());
    const person = testPerson('Private Name');
    const profile = await profiles.save(person, {
      version: 0,
      headline: 'Private Name engineer at Secret Employer https://identity.test',
      about: 'Contact private@example.test for TypeScript and React work',
      preferences: 'Minimum salary 50000; no travel',
      experience: [{ title: 'Software engineer', company: 'Secret Employer', description: 'React and TypeScript', start: '2021', end: '', hidden: false }],
    });
    assert.match(profile.alias, /^Candidate #[a-f0-9]{8}$/);
    assert.equal(profile.publicSummary.includes('React'), true);
    assert.doesNotMatch(profile.publicSummary, /Private Name|Secret Employer|identity|example|50000/);
    assert.equal(profile.preferences, 'Minimum salary 50000; no travel');
    await assert.rejects(profiles.save(person, { version: 1, verified: [verification] }), /editable/);
    await assert.rejects(profiles.save(person, { version: 1, publicSummary: 'injected' }), /editable/);
    await assert.rejects(profiles.save(person, { version: 0, about: 'stale' }), /changed/);
    await profiles.verify(person.id, verification);
    const verified = await profiles.mine(person);
    assert.equal(verified.employerDomains.includes('private-employer.test'), true);
    const saved = await profiles.save(person, { version: verified.version, employerDomains: [] });
    assert.equal(saved.employerDomains.includes('private-employer.test'), true);
    assert.equal(saved.alias, profile.alias);
    const other = testPerson('Other');
    assert.equal((await profiles.mine(other)).preferences, '');
    await assert.rejects(profiles.mine({ id: 'bot-1', kind: 'bot' }), /person/);
    const results = await Promise.allSettled([profiles.save(person, { version: saved.version, about: 'one' }), profiles.save(person, { version: saved.version, about: 'two' })]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  });

  it('stores split private preferences (salary min + currency, locations + workModes, noGos) privately and validates inputs', async () => {
    const profiles = new Profiles(testDb());
    const person = { id: 'google-sub-candidate-1', kind: 'human' as const, email: 'cand@people.test' };
    const saved = await profiles.save(person, {
      version: 0,
      headline: 'Senior Go & Kubernetes Backend Engineer',
      about: 'Distributed systems in Go and PostgreSQL',
      salary: { min: 185000, currency: 'eur' },
      locations: ['Berlin', 'London', 'Berlin'],
      workModes: ['hybrid', 'remote'],
      noGos: 'No crypto, gambling, or >1-in-6 on-call',
      experience: [{ title: 'Senior Backend Engineer', company: 'Secret Corp', description: 'Go, PostgreSQL, Kubernetes', start: '2020-01', end: '2024-01', hidden: false }],
    });
    assert.deepEqual(saved.salary, { min: 185000, currency: 'EUR' });
    assert.equal(saved.salaryMin, 185000);
    assert.equal(saved.salaryCurrency, 'EUR');
    assert.deepEqual(saved.locations, ['Berlin', 'London']);
    assert.deepEqual(saved.workModes, ['remote', 'hybrid']);
    assert.equal(saved.noGos, 'No crypto, gambling, or >1-in-6 on-call');
    assert.doesNotMatch(saved.publicSummary, /185000|EUR|Berlin|London|crypto|gambling/);

    const reloaded = await profiles.mine(person);
    assert.deepEqual(reloaded.salary, { min: 185000, currency: 'EUR' });
    assert.deepEqual(reloaded.locations, ['Berlin', 'London']);
    assert.deepEqual(reloaded.workModes, ['remote', 'hybrid']);
    assert.equal(reloaded.noGos, 'No crypto, gambling, or >1-in-6 on-call');

    // Clearing salary min removes salaryMin while keeping currency
    const cleared = await profiles.save(person, {
      version: reloaded.version,
      salary: { min: null, currency: 'GBP' },
      onsite: true,
      hybrid: false,
    });
    assert.deepEqual(cleared.salary, { currency: 'GBP' });
    assert.equal(cleared.salaryMin, undefined);
    assert.deepEqual(cleared.workModes, ['remote', 'onsite']);

    // Validation errors on invalid salary, currency, or workModes
    await assert.rejects(profiles.save(person, { version: cleared.version, salary: { min: -50, currency: 'USD' } }), /Minimum salary/);
    await assert.rejects(profiles.save(person, { version: cleared.version, salary: { min: 100000, currency: 'US$' } }), /Currency/);
    await assert.rejects(profiles.save(person, { version: cleared.version, workModes: ['anywhere'] }), /workModes/);
  });

  it('uses controlled roles, merged date ranges and numeric verified counts without identifiers', () => {
    const role = { id: 'a', title: 'Senior Backend Engineer at Jane Doe https://secret.test', company: 'Jane Doe https://secret.test', start: '2020-01', end: '2022-01', description: '', hidden: false, source: 'self' as const };
    const summary = publicSummary({
      headline: 'Jane Doe',
      about: 'https://secret.test',
      experience: [role, { ...role, id: 'b', start: '2021-01', end: '2023-01' }, { ...role, id: 'hidden', title: 'Data Scientist', start: '1990', end: '2020', hidden: true }, { ...role, id: 'invalid', start: '2024-13', end: '2025' }],
      verified: [{ id: 'github', source: 'github', label: 'https://secret.test', verifiedAt: '', data: { login: 'JaneDoe', repositories: ['secret'], publicRepositories: 7, mergedPublicPullRequests: 19, restrictedContributionsCount: 23 } }],
    });
    assert.equal(summary.includes('Backend engineer'), true);
    assert.equal(summary.includes('3 full years across dated roles'), true);
    assert.equal(summary.includes('7 public repositories'), true);
    assert.equal(summary.includes('19 merged public PRs'), true);
    assert.equal(summary.includes('23 restricted contributions'), true);
    assert.doesNotMatch(summary, /Jane|secret|https|Scientist|30 full/);
    const invalid = publicSummary({ headline: '', about: '', experience: [{ ...role, start: '2024', end: '2023' }], verified: [{ id: 'github', source: 'github', label: 'x', verifiedAt: '', data: { publicRepositories: -1, mergedPublicPullRequests: 'private URL', restrictedContributionsCount: 1.5 } }] });
    assert.doesNotMatch(invalid, /full years|public repositories|merged public PRs|restricted contributions/);
    assert.equal(publicSummary({ headline: '', about: '', verified: [], experience: [{ ...role, start: '2020', end: '2022' }] }).includes('1 full year across dated roles'), true);
    const now = new Date();
    const start = `${now.getUTCFullYear() - 2}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    assert.equal(publicSummary({ headline: '', about: '', verified: [], experience: [{ ...role, start, end: 'Present' }] }).includes('2 full years'), true);
    assert.equal(publicSummary({ headline: '', about: '', verified: [], experience: [{ ...role, start: '2020-01', end: '2020-07' }] }).includes('less than 1 year'), true);
  });

  it('checks short alias collisions and preserves existing aliases', async () => {
    const db = testDb(), profiles = new Profiles(db);
    const person = testPerson('Short alias');
    await db.collection('profiles').doc('other').set({ alias: 'Candidate #aaaaaaaa' });
    let call = 0;
    const seq = ['aaaaaaaa-1111-4111-8111-111111111111', 'bbbbbbbb-2222-4222-8222-222222222222'];
    const random = mock.method(wire, 'newId', () => seq[call++] ?? randomUUID());
    try {
      const profile = await profiles.save(person, { version: 0 });
      assert.equal(profile.alias, 'Candidate #bbbbbbbb');
      const legacy = `Candidate #${'c'.repeat(32)}`;
      await db.collection('profiles').doc(person.id).update({ alias: legacy });
      assert.equal((await profiles.save(person, { version: profile.version })).alias, legacy);
      const another = testPerson('Verified alias');
      random.mock.restore();
      await profiles.verify(another.id, verification);
      assert.match((await profiles.mine(another)).alias, /^Candidate #[a-f0-9]{8}$/);
    } finally {
      random.mock.restore();
    }
  });

  it('does not copy hidden role prose into the anonymous summary', () => {
    assert.equal(publicSummary({ headline: '', about: '', experience: [{ id: 'x', title: 'Rust engineer', company: 'Secret', start: '', end: '', description: '', hidden: true, source: 'self' }], verified: [] }).includes('Rust'), false);
  });
});

describe('Google Talent sign-in & GitHub/LinkedIn connections', () => {
  it('builds PKCE authorization URL, exchanges code for verified Google sub/email, and rejects unverified accounts', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([String(url), init]);
      if (String(url).includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'GOOGLE_ACCESS_TOKEN' }));
      }
      return new Response(JSON.stringify({
        sub: 'google-sub-998877',
        email: 'Alice@Example.com',
        email_verified: true,
        name: 'Alice Example',
      }));
    };
    const google = new TalentGoogle({ clientId: 'g-client', clientSecret: 'g-secret', webUrl: 'https://parly-talent.vercel.app' }, fetcher as typeof fetch);
    const authUrl = new URL(google.authorizeUrl('state-123', 'v'.repeat(43)));
    assert.equal(authUrl.origin, 'https://accounts.google.com');
    assert.equal(authUrl.searchParams.get('client_id'), 'g-client');
    assert.equal(authUrl.searchParams.get('redirect_uri'), `https://parly-talent.vercel.app${GOOGLE_CALLBACK_PATH}`);
    assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');

    const identity = await google.exchange('auth-code', 'v'.repeat(43));
    assert.deepEqual(identity, { sub: 'google-sub-998877', email: 'alice@example.com', name: 'Alice Example' });
    assert.doesNotMatch(JSON.stringify(identity), /GOOGLE_ACCESS_TOKEN/);

    const unverifiedGoogle = new TalentGoogle(
      { clientId: 'g-client', clientSecret: 'g-secret', webUrl: 'https://parly-talent.vercel.app' },
      (async (url: string | URL | Request) =>
        String(url).includes('token')
          ? new Response(JSON.stringify({ access_token: 'tok' }))
          : new Response(JSON.stringify({ sub: 'google-sub-1', email: 'a@b.com', email_verified: false }))) as typeof fetch,
    );
    await assert.rejects(unverifiedGoogle.exchange('auth-code', 'v'.repeat(43)), /unverified|invalid/);
  });
});

describe('GitHub Talent identity', () => {
  it('queries public activity and stores only allowlisted facts, never token or private metadata', async () => {
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('access_token')) return new Response(JSON.stringify({ access_token: 'PRIVATE_TOKEN' }));
      if (String(url).endsWith('/user')) return new Response(JSON.stringify({ id: 123, login: 'candidate', name: 'Person' }));
      const request = JSON.parse(String(init?.body));
      assert.equal(request.query, githubProfileQuery);
      assert.equal(request.query.includes('privacy: PUBLIC'), true);
      assert.equal(request.variables.prs, 'author:candidate is:pr is:merged is:public');
      return new Response(JSON.stringify({ data: { viewer: { repositories: { totalCount: 1, nodes: [{ name: 'public-repo', languages: { nodes: [{ name: 'Go' }] } }] }, contributionsCollection: { restrictedContributionsCount: 7 }, privateRepo: 'NEVER_STORE' }, search: { issueCount: 4 } } }));
    };
    const github = new TalentGitHub({ clientId: 'id', clientSecret: 'secret', webUrl: 'https://talent.test' }, fetcher as typeof fetch);
    const result = await github.exchange('code', 'x'.repeat(43));
    assert.equal(result.id, 123);
    assert.equal(result.login, 'candidate');
    assert.deepEqual(result.verification.data, { restrictedContributionsCount: 7, mergedPublicPullRequests: 4, publicRepositories: 1, languages: ['Go'] });
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_TOKEN|NEVER_STORE/);
  });

  it('meters a model import even if the extracted JSON is malformed', async () => {
    let added = 0;
    const meter: LlmMeter = { used: async () => 0, add: async () => { added += 1; } };
    const run = vertexProfileImporter({
      project: 'p', location: 'global', model: 'test', prices: { input: 1, output: 1 }, meter,
      accessToken: async () => 'test',
      fetchImpl: (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'bad json' }] } }], usageMetadata: { promptTokenCount: 100 } }))) as typeof fetch,
    });
    await assert.rejects(run('owner', { text: 'source' }), /valid profile/);
    assert.equal(added, 1);
  });

  it('configures Firestore for parly-talent-0a7c87 with Vercel OIDC Workload Identity Federation in production', async () => {
    assert.equal(DEFAULT_GCP_PROJECT_ID, 'parly-talent-0a7c87');
    const prevEmulator = process.env.FIRESTORE_EMULATOR_HOST;
    const prevNum = process.env.GCP_PROJECT_NUMBER;
    const prevSa = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
    try {
      delete process.env.FIRESTORE_EMULATOR_HOST;
      process.env.GCP_PROJECT_NUMBER = '123456789';
      process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'talent-web@parly-talent-0a7c87.iam.gserviceaccount.com';
      const prodDb = createFirestore();
      assert.equal(prodDb.projectId, 'parly-talent-0a7c87');
      await prodDb.terminate();
    } finally {
      if (prevEmulator !== undefined) process.env.FIRESTORE_EMULATOR_HOST = prevEmulator;
      if (prevNum === undefined) delete process.env.GCP_PROJECT_NUMBER; else process.env.GCP_PROJECT_NUMBER = prevNum;
      if (prevSa === undefined) delete process.env.GCP_SERVICE_ACCOUNT_EMAIL; else process.env.GCP_SERVICE_ACCOUNT_EMAIL = prevSa;
    }
  });
});



import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { testDb } from '../lib/db.ts';
import { Profiles } from '../lib/profiles.ts';

function testPerson(name = 'Owner') {
  const id = `person-${randomUUID().slice(0, 8)}`;
  return { id, name, kind: 'human' as const, email: `${id}@people.test` };
}

describe('Talent anonymous candidate search', () => {
  it('returns only approved anonymous matching facts, ranks exact technologies, and blocks employers', async () => {
    const db = testDb();
    const profiles = new Profiles(db);
    const company = testPerson('Searcher');
    await profiles.verify(company.id, { id: 'work', source: 'work-email', label: 'Work email', verifiedAt: '', data: { domain: 'secret-employer.test' } });
    const one = testPerson('Private Candidate');
    const saved = await profiles.save(one, {
      version: 0,
      headline: 'Python TypeScript',
      about: 'Private Name private@identity.test',
      openTo: 'Private Name remote backend engineer https://identity.test',
      preferences: 'Private salary 100000',
      employerDomains: ['blocked.test'],
      experience: [{ title: 'Backend engineer', company: 'Secret Employer', description: 'Python and TypeScript', start: '2020', end: '2024' }],
    });
    await profiles.verify(one.id, { id: 'github', source: 'github', label: 'Private Name', verifiedAt: '', data: { login: 'private-login', publicRepositories: 7 } });
    const two = testPerson('Lower rank');
    await profiles.save(two, { version: 0, headline: 'TypeScript' });
    const blocked = testPerson('Blocked');
    await profiles.save(blocked, { version: 0, headline: 'Python TypeScript', employerDomains: ['secret-employer.test'] });
    const unapproved = testPerson('Unapproved');
    await profiles.verify(unapproved.id, { id: 'github', source: 'github', label: '', verifiedAt: '', data: { languages: ['Python', 'TypeScript'] } });

    const result = await profiles.search(company, 'Backend engineer Python TypeScript');
    assert.equal(result.profiles.length, 2);
    assert.equal(result.profiles[0]!.alias, saved.alias);
    assert.deepEqual(Object.keys(result.profiles[0]!).sort(), ['alias', 'badges', 'facts', 'openTo', 'publicSummary']);
    assert.deepEqual(result.profiles[0]!.badges, ['github']);
    assert.equal(result.profiles[0]!.openTo, 'Backend engineer, Remote');
    assert.doesNotMatch(JSON.stringify(result), /Private Name|private@|identity.test|salary|100000|secret-employer|blocked.test|private-login/);
    assert.equal(JSON.stringify(result).includes(one.id), false);

    const java = testPerson('JavaScript only');
    await profiles.save(java, { version: 0, headline: 'JavaScript' });
    assert.equal((await profiles.search(company, 'Java')).profiles.length, 0);
    assert.deepEqual((await profiles.search(company, '')).profiles, []);
    await assert.rejects(profiles.search(company, 'x'.repeat(1001)), /1000/);
    await assert.rejects(profiles.search({ id: 'bot-1', kind: 'bot' }, 'Python'), /person/);
  });

  it("requires a verified work email before searching, blocks verified domains, and never searches the caller's own profile", async () => {
    const db = testDb();
    const profiles = new Profiles(db);
    const caller = testPerson();
    await profiles.save(caller, { version: 0, headline: 'Python' });
    const candidate = testPerson();
    await profiles.save(candidate, { version: 0, headline: 'Python', employerDomains: ['employer.test'] });

    // Unverified searcher (even with an email on the caller object or GitHub verified) cannot search.
    await profiles.verify(caller.id, { id: 'github', source: 'github', label: 'GitHub', verifiedAt: '', data: { languages: ['Python'] } });
    await assert.rejects(profiles.search(caller.id, 'Python'), /Verify your work email/);
    await assert.rejects(profiles.search(caller, 'Python'), /Verify your work email/);

    // Once work email is verified, blocked domains (and subdomains) are enforced and the caller's own profile is hidden.
    await profiles.verify(caller.id, { id: 'work-email:eng.employer.test', source: 'work-email', label: 'Work email verified', verifiedAt: '', data: { domain: 'eng.employer.test' } });
    assert.deepEqual((await profiles.search(caller.id, 'Python')).profiles, []);
  });
});

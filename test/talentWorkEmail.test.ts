import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it, mock } from 'node:test';
import { testDb } from '../lib/db.ts';
import { Profiles } from '../lib/profiles.ts';
import { WorkEmailVerification } from '../lib/workEmail.ts';

function testPerson(name = 'Owner') {
  const id = `person-${randomUUID().slice(0, 8)}`;
  return { id, name, kind: 'human' as const, email: `${id}@people.test` };
}

function fixture() {
  const db = testDb(), profiles = new Profiles(db);
  const calls: [string[], string, string][] = [];
  let failNextMail = false;
  const mailer = mock.fn(async (to: string[], subject: string, text: string) => {
    if (failNextMail) { failNextMail = false; throw new Error('SMTP password secret'); }
    calls.push([to, subject, text]);
  });
  const service = new WorkEmailVerification(db, profiles, mailer);
  const code = () => calls.at(-1)![2].match(/\b\d{6}\b/)![0];
  return { db, profiles, mailer, calls, failMailOnce: () => { failNextMail = true; }, service, code };
}

describe('Talent work email', () => {
  it('stores a salted hash, verifies atomically once, and keeps identity and employer private', async () => {
    const { db, profiles, calls, service, code } = fixture();
    const person = testPerson();
    await service.request(person, 'Worker@Secret-Employer.test');
    assert.deepEqual(calls[0]![0], ['worker@secret-employer.test']);
    const challenge = (await db.collection('talent_email_challenges').doc(person.id).get()).data()!;
    assert.equal(challenge.codeHash.length, 64); assert.equal(challenge.salt.length, 64);
    assert.equal('code' in challenge, false); assert.notEqual(challenge.codeHash, code());
    const results = await Promise.allSettled([service.confirm(person, code()), service.confirm(person, code())]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const profile = await profiles.mine(person);
    assert.equal(profile.version, 1);
    assert.equal(profile.verified[0]!.data.domain, 'secret-employer.test');
    assert.equal(profile.employerDomains.includes('secret-employer.test'), true);
    assert.equal(profile.publicSummary.includes('Work email verified.'), true);
    assert.doesNotMatch(profile.publicSummary, /secret|worker@/i);
    const edited = await profiles.save(person, { version: profile.version, employerDomains: [] });
    assert.equal(edited.employerDomains.includes('secret-employer.test'), true);
  });

  it("persists five wrong attempts and rejects expired, consumed and another person's code", async () => {
    const { db, profiles, service, code } = fixture();
    const person = testPerson(), other = testPerson();
    await service.request(person, 'worker@employer.test');
    await assert.rejects(service.confirm(other, code()), /incorrect/);
    const wrong = code() === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await assert.rejects(service.confirm(person, wrong), /incorrect/);
    assert.equal((await db.collection('talent_email_challenges').doc(person.id).get()).data()!.attempts, 5);
    await assert.rejects(service.confirm(person, code()), /incorrect/);
    await db.collection('talent_email_challenges').doc(person.id).update({ attempts: 0, expiresAt: Date.now() - 1 });
    await assert.rejects(service.confirm(person, code()), /expired/);
    assert.equal((await profiles.mine(person)).version, 0);
  });

  it('limits sends per person and mailbox across service instances, and invalidates old codes', async () => {
    const { db, profiles, service, mailer, calls, code } = fixture();
    const person = testPerson(), other = testPerson();
    await service.request(person, 'worker@employer.test');
    const old = code();
    const second = new WorkEmailVerification(db, profiles, mailer);
    await assert.rejects(second.request(person, 'another@employer.test'), /minute/);
    await assert.rejects(second.request(other, 'worker@employer.test'), /minute/);
    await db.collection('talent_email_challenges').doc(person.id).update({ sentAt: Date.now() - 61_000 });
    await second.request(person, 'second@employer.test');
    await assert.rejects(service.confirm(person, old), /incorrect/);
    await service.confirm(person, code());
    assert.equal((await profiles.mine(person)).verified[0]!.data.domain, 'employer.test');
    await db.collection('talent_email_challenges').doc(person.id).update({ sentAt: Date.now() - 61_000, count: 5 });
    await assert.rejects(second.request(person, 'third@employer.test'), /hour/);
    const third = testPerson(), fourth = testPerson();
    const beforeCalls = calls.length;
    const results = await Promise.allSettled([service.request(third, 'same@employer.test'), second.request(fourth, 'same@employer.test')]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(calls.length, beforeCalls + 1);

    for (let i = 0; i < 17; i++) {
      await service.request(testPerson(), `local-${i}@employer.test`);
    }
    await assert.rejects(service.request(testPerson(), 'overflow@employer.test'), /hour/);
  });

  it('does not consume a challenge if the profile update fails', async () => {
    const { db, profiles, service, code } = fixture();
    const person = testPerson();
    await service.request(person, 'worker@employer.test');
    const original = profiles.verify.bind(profiles);
    let failOnce = true;
    const spy = mock.method(profiles, 'verify', async (...args: Parameters<typeof original>) => {
      await original(...args);
      if (failOnce) { failOnce = false; throw new Error('storage unavailable'); }
    });
    await assert.rejects(service.confirm(person, code()), /storage/);
    assert.equal((await db.collection('talent_email_challenges').doc(person.id).get()).data()!.consumed, false);
    assert.equal((await profiles.mine(person)).version, 0);
    spy.mock.restore();
    await service.confirm(person, code());
    assert.equal((await profiles.mine(person)).version, 1);
  });

  it('rejects bots, invalid and public email addresses, missing mailer and delivery failures', async () => {
    const { db, profiles, service, failMailOnce } = fixture();
    const person = testPerson();
    const bot = { id: 'bot-1', kind: 'bot' };
    await assert.rejects(service.request(bot, 'worker@employer.test'), /person/);
    await assert.rejects(service.request(person, 'worker@gmail.com'), /Use your work email address, not a personal one \(Gmail, Outlook…\)\./);
    for (const email of ['x\r\nbcc:evil@example.test', 'nope', 'worker@-bad.test']) {
      await assert.rejects(service.request(person, email));
    }
    await assert.rejects(new WorkEmailVerification(db, profiles).request(person, 'worker@employer.test'), /not configured/);
    failMailOnce();
    await assert.rejects(service.request(person, 'worker@employer.test'), /Could not send the verification code/);
    await assert.rejects(service.request(person, 'worker@employer.test'), /minute/);
    assert.equal((await profiles.mine(person)).version, 0);
  });
});


import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import { testDb } from '../lib/db.ts';
import { matchEmail } from '../lib/matchEmail.ts';
import { Profiles } from '../lib/profiles.ts';
import { TalentRoomViews, type ParlyRoomsClient, type StoredTalentRoom } from '../lib/roomViews.ts';

const SECRET = 'private.login@gmail.com';

async function setup(mailer: (to: string[], subject: string, text: string, html?: string) => Promise<void>, id: string, cand: Record<string, string> = { loginEmail: SECRET, workEmail: 'dana@work.dev', githubLogin: 'dana' }) {
  const db = testDb();
  const profiles = new Profiles(db);
  await profiles.recordContact('cand', cand);
  await profiles.recordContact('comp', { loginEmail: 'Boss@Acme.dev' });
  await db.collection('talent_rooms').doc(id).set({
    companyId: 'comp', companyName: 'acme.dev', candidateId: 'cand', candidateAlias: 'Candidate #1',
    brief: { role: 'Backend Engineer', comp: '$200k', mustHaves: 'Go' }, status: 'negotiating',
    documentVersion: 1, createdAt: '2026-10-29T05:00:00.000Z', updatedAt: '2026-10-29T05:00:00.000Z',
  } as unknown as StoredTalentRoom);
  const approved: Record<string, boolean> = {};
  const client = {
    async getRoom() { return { document: { text: '## Deal\nStart in **May**', version: 1, approvals: {} } }; },
    async approve(_: string, side: string) { approved[side] = true; return { ok: true, agreed: Boolean(approved.company && approved.candidate) }; },
  } as unknown as ParlyRoomsClient;
  return { db, views: new TalentRoomViews(db, client, mailer) };
}

function collector() {
  const mails: { to: string[]; all: string }[] = [];
  return { mails, mailer: async (to: string[], subject: string, text: string, html?: string) => { mails.push({ to, all: [to, subject, text, html].join('\n') }); } };
}

describe('match emails', () => {
  before(() => { process.env.APP_URL = 'https://shyhire.test/'; });

  it('mails each side once, only when the room matches, without the private login address reaching the company', async () => {
    const { mails, mailer } = collector();
    const { views } = await setup(mailer, 'room-mail-1');
    await views.approve('comp', 'room-mail-1', 1);
    assert.equal(mails.length, 0);
    await views.approve('cand', 'room-mail-1', 1);
    await views.handleWebhookEvent({ id: 'evt-1', type: 'room.agreed', data: { roomId: 'room-mail-1' } });

    assert.deepEqual(mails.map((m) => m.to).sort(), [['boss@acme.dev'], [SECRET]].sort());
    const toCompany = mails.find((m) => m.to[0] === 'boss@acme.dev')!;
    assert.ok(!toCompany.all.includes(SECRET));
    assert.ok(toCompany.all.includes('dana@work.dev'));
    assert.ok(!mails.some((m) => m.all.includes('$200k')));
    assert.ok(mails[0]!.all.includes('https://shyhire.test/talent/conversations/room-mail-1'));
  });

  it('mails each side once when the match arrives by webhook, even if it is delivered twice', async () => {
    const { mails, mailer } = collector();
    const { views } = await setup(mailer, 'room-mail-3');
    await views.handleWebhookEvent({ id: 'evt-2', type: 'room.agreed', data: { roomId: 'room-mail-3' } });
    await views.handleWebhookEvent({ id: 'evt-3', type: 'room.agreed', data: { roomId: 'room-mail-3' } });
    assert.equal(mails.length, 2);
  });

  it('a mail failure does not fail the approval and still tries the other side', async () => {
    let tries = 0;
    const { views } = await setup(async () => { tries += 1; throw new Error('smtp down'); }, 'room-mail-2');
    await views.approve('comp', 'room-mail-2', 1);
    assert.deepEqual(await views.approve('cand', 'room-mail-2', 1), { ok: true, agreed: true });
    assert.equal(tries, 2);
  });

  it('logs instead of silently dropping when a side has no address on file', async () => {
    const { mails, mailer } = collector();
    // no loginEmail, no verified work email: nothing to mail the candidate at.
    const { views } = await setup(mailer, 'room-mail-4', { githubLogin: 'dana' });
    const errors: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { errors.push(a.join(' ')); };
    try {
      await views.approve('comp', 'room-mail-4', 1);
      await views.approve('cand', 'room-mail-4', 1);
      await views.handleWebhookEvent({ id: 'evt-4', type: 'room.agreed', data: { roomId: 'room-mail-4' } });
    } finally {
      console.error = orig;
    }
    // company still mailed; candidate had no address and was logged, not dropped in silence.
    assert.deepEqual(mails.map((m) => m.to), [['boss@acme.dev']]);
    assert.ok(errors.some((e) => e.includes('no address on file') && e.includes('cand')));
  });

  it('escapes everything agents and people wrote', () => {
    const { html, text } = matchEmail({
      other: { side: 'candidate', displayName: '<b>x</b>', githubLogin: 'a"b', githubUrl: 'https://github.com/a"b', verifiedDomains: [] },
      role: 'R&D', summary: '<script>alert(1)</script> **bold**', url: 'https://x.test/?a=1&b="2',
    });
    assert.ok(!html.includes('<script>') && !html.includes('<b>x'));
    assert.ok(html.includes('R&#38;D') && html.includes('<strong>bold</strong>'));
    assert.ok(!html.includes('b="2'));
    assert.ok(text.includes('**bold**'));
  });
});

describe('rememberLogin', () => {
  it('stores the address of someone signed in before it was recorded, and survives no email', async () => {
    const id = `old-session-${Date.now()}`;
    const db = testDb();
    const profiles = new Profiles(db);
    await profiles.rememberLogin({ sub: id });
    await profiles.rememberLogin({ sub: id, email: 'Old.User@Gmail.com' });
    const contact = await db.collection('talent_contacts').doc(id).get();
    assert.equal(contact.get('loginEmail'), 'old.user@gmail.com');
  });

  it('runs on every talent page load, not only on actions', () => {
    assert.match(readFileSync('app/talent/layout.tsx', 'utf8'), /await profiles\(\)\.rememberLogin\(session\)/);
  });
});

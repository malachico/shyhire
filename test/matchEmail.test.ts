import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FieldValue } from '@google-cloud/firestore';
import { before, describe, it } from 'node:test';
import { testDb } from '../lib/db.ts';
import { attentionEmail, matchEmail } from '../lib/matchEmail.ts';
import { Profiles } from '../lib/profiles.ts';
import { TalentRoomViews, type ParlyRoomsClient, type StoredTalentRoom } from '../lib/roomViews.ts';

const SECRET = 'private.login@gmail.com';

async function setup(mailer: (to: string[], subject: string, text: string, html?: string) => Promise<void>, id: string) {
  const db = testDb();
  const profiles = new Profiles(db);
  await profiles.recordContact('cand', { loginEmail: SECRET, workEmail: 'dana@work.dev', githubLogin: 'dana' });
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
    assert.equal(mails.splice(0).filter((m) => m.all.includes("It's a match")).length, 0);
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
    assert.equal(tries, 3); // "your turn" to the candidate, then the match to both.
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

describe('attention emails', () => {
  before(() => { process.env.APP_URL = 'https://shyhire.test/'; });
  const CANDIDATE = [[SECRET]], COMPANY = [['boss@acme.dev']];
  const question = (id: string, room: string, side: string) => ({ id, type: 'room.needs_decision', data: { roomId: room, side, question: 'acme.dev offers $200k, ok?', options: ['Yes'] } });
  const summary = (id: string, room: string, version: number) => ({ id, type: 'room.document_updated', data: { roomId: room, version } });

  it("mails only the side being asked, once, with nothing from the room in it", async () => {
    const { mails, mailer } = collector();
    const { views } = await setup(mailer, 'room-att-1');
    const evt = question('q1', 'room-att-1', 'candidate');
    await views.handleWebhookEvent(evt);
    await views.handleWebhookEvent(evt);
    assert.deepEqual(mails.map((m) => m.to), CANDIDATE);
    for (const leak of ['acme', 'Backend', '$200k']) assert.ok(!mails[0]!.all.toLowerCase().includes(leak.toLowerCase()), leak);
    assert.ok(mails[0]!.all.includes('https://shyhire.test/talent/conversations/room-att-1'));
  });

  it('mails both sides for the first summary, not for agent revisions, and again when a person rewrites an approved one', async () => {
    const { mails, mailer } = collector();
    const { db, views } = await setup(mailer, 'room-att-2');
    await db.collection('talent_rooms').doc('room-att-2').update({ documentVersion: FieldValue.delete() });
    await views.handleWebhookEvent(summary('d1', 'room-att-2', 1));
    assert.equal(mails.splice(0).length, 2);
    await views.handleWebhookEvent(summary('d2', 'room-att-2', 2));
    assert.equal(mails.length, 0);
    await views.approve('comp', 'room-att-2', 2);
    mails.length = 0;
    await views.handleWebhookEvent(summary('d3', 'room-att-2', 3));
    assert.equal(mails.splice(0).length, 2);
    await views.handleWebhookEvent(summary('d4', 'room-att-2', 4));
    assert.equal(mails.length, 0);
  });

  it('tells only the other side when one approves, once even on a double click', async () => {
    const { mails, mailer } = collector();
    const { views } = await setup(mailer, 'room-att-3');
    await views.approve('cand', 'room-att-3', 1);
    await views.approve('cand', 'room-att-3', 1);
    assert.deepEqual(mails.map((m) => m.to), COMPANY);
    assert.ok(mails[0]!.all.includes('They approved'));
  });

  it('stays quiet when the webhook for an approved summary arrives after the approval', async () => {
    const { mails, mailer } = collector();
    const { views } = await setup(mailer, 'room-att-5');
    await views.approve('comp', 'room-att-5', 1);
    mails.length = 0;
    await views.handleWebhookEvent(summary('d5', 'room-att-5', 1));
    assert.equal(mails.length, 0);
  });

  it('a mail failure does not fail the webhook', async () => {
    const { views } = await setup(async () => { throw new Error('smtp down'); }, 'room-att-4');
    assert.deepEqual(await views.handleWebhookEvent(question('q2', 'room-att-4', 'company')), { ok: true });
  });

  it('every kind names no one and links to the conversation', () => {
    for (const kind of ['question', 'summary', 'their_approval'] as const) {
      const { html, text } = attentionEmail(kind, 'https://x.test/?a=1&b="2');
      assert.ok(!html.includes('b="2') && text.includes('https://x.test/'));
    }
  });
});

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { signSession, verifySession } from '../lib/session.ts';
import { verifyParlySignature } from '../lib/webhooks.ts';

const secret = 'x'.repeat(40);

test('a session cookie verifies, and a forged or old one does not', () => {
  const value = signSession({ githubId: 7, login: 'dev', issuedAt: Date.now() }, secret);
  assert.equal(verifySession(value, secret)?.login, 'dev');
  assert.equal(verifySession(value, 'y'.repeat(40)), undefined);
  const [payload] = value.split('.');
  const forged = Buffer.from(JSON.stringify({ githubId: 1, login: 'admin', issuedAt: Date.now() })).toString('base64url');
  assert.equal(verifySession(`${forged}.${value.split('.')[1]}`, secret), undefined);
  assert.equal(verifySession(`${payload}`, secret), undefined);
  const old = signSession({ githubId: 7, login: 'dev', issuedAt: Date.now() - 31 * 24 * 3600 * 1000 }, secret);
  assert.equal(verifySession(old, secret), undefined);
});

test("Parly's webhook signature verifies; a tampered body, wrong secret or stale timestamp does not", () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'room.agreed', data: { roomId: 'r1' } });
  const t = Math.floor(Date.now() / 1000);
  const header = `t=${t},v1=${createHmac('sha256', 'whsec_abc').update(`${t}.${body}`).digest('hex')}`;
  assert.equal(verifyParlySignature(header, body, 'whsec_abc'), true);
  assert.equal(verifyParlySignature(header, body + ' ', 'whsec_abc'), false);
  assert.equal(verifyParlySignature(header, body, 'whsec_other'), false);
  assert.equal(verifyParlySignature(header, body, 'whsec_abc', t + 600), false);
  assert.equal(verifyParlySignature(null, body, 'whsec_abc'), false);
});

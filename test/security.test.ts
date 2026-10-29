import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { gcpExternalAccountClient } from '../lib/db.ts';
import { signSession, verifySession } from '../lib/session.ts';
import { verifyParlySignature } from '../lib/webhooks.ts';

const secret = 'x'.repeat(40);

test('gcpExternalAccountClient supplies the raw Vercel OIDC token without exchanging it for the IAM pool audience', async () => {
  const fakePayload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, aud: 'https://vercel.com/test' })).toString('base64url');
  const fakeJwt = `eyJhbGciOiJSUzI1NiJ9.${fakePayload}.sig`;
  const prevToken = process.env.VERCEL_OIDC_TOKEN;
  const prevNum = process.env.GCP_PROJECT_NUMBER;
  const prevSa = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  process.env.VERCEL_OIDC_TOKEN = fakeJwt;
  process.env.GCP_PROJECT_NUMBER = '123456';
  process.env.GCP_SERVICE_ACCOUNT_EMAIL = 'test@example.iam.gserviceaccount.com';
  try {
    const client = gcpExternalAccountClient() as unknown as {
       subjectTokenSupplier: { getSubjectToken: (ctx: { audience: string; subjectTokenType: string }) => Promise<string> };
    };
    assert.ok(client);
    const token = await client.subjectTokenSupplier.getSubjectToken({
      audience: '//iam.googleapis.com/projects/123456/locations/global/workloadIdentityPools/vercel/providers/vercel',
      subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
    });
    assert.equal(token, fakeJwt);
  } finally {
    if (prevToken === undefined) delete process.env.VERCEL_OIDC_TOKEN;
    else process.env.VERCEL_OIDC_TOKEN = prevToken;
    if (prevNum === undefined) delete process.env.GCP_PROJECT_NUMBER;
    else process.env.GCP_PROJECT_NUMBER = prevNum;
    if (prevSa === undefined) delete process.env.GCP_SERVICE_ACCOUNT_EMAIL;
    else process.env.GCP_SERVICE_ACCOUNT_EMAIL = prevSa;
  }
});

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

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { signInErrorMessage } from '../lib/signInError.ts';

const GENERIC = 'Something went wrong signing you in. Please try again.';

it('maps known ?error= codes to fixed messages', () => {
  assert.equal(signInErrorMessage('cancelled'), 'Google sign-in was cancelled. Please try again.');
  assert.equal(signInErrorMessage('failed'), 'Google sign-in failed. Please try again.');
});

it('never echoes an unknown ?error= value: a crafted link gets the generic message', () => {
  for (const v of ['Your account is locked. Call 555-0100', '<b>hi</b>', 'toString', '__proto__', ['cancelled', 'x']]) {
    assert.equal(signInErrorMessage(v), GENERIC);
  }
  assert.equal(signInErrorMessage(undefined), undefined);
  assert.equal(signInErrorMessage(''), undefined);
});

it('the landing page renders the mapped message, and the callback sends codes, not text', () => {
  const page = readFileSync('app/page.tsx', 'utf8');
  assert.doesNotMatch(page, />\{error\}</);
  assert.match(page, /signInErrorMessage\(/);
  const cb = readFileSync('app/talent/auth/google/callback/route.ts', 'utf8');
  assert.doesNotMatch(cb, /\?error=\$\{encodeURIComponent/);
});

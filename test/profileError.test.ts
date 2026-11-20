import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { connectErrorCode, profileErrorMessage } from '../lib/profileError.ts';

const GENERIC = 'Something went wrong. Please try again.';

it('maps the codes the connect callbacks send to fixed messages', () => {
  for (const p of ['github', 'linkedin'] as const) {
    for (const t of [undefined, 'invalid', 'unauthorized', 'conflict', 'unavailable']) {
      const msg = profileErrorMessage(connectErrorCode(p, t));
      assert.ok(msg && msg !== GENERIC, `${p}/${t}`);
    }
    assert.notEqual(profileErrorMessage(`${p}_not_configured`), GENERIC);
  }
  assert.equal(profileErrorMessage('github_conflict'), 'This GitHub account is already connected to another profile.');
});

it('never echoes an unknown ?error= value: a crafted link gets the generic message', () => {
  for (const v of ['Your account is locked. Call 555-0100', '<b>hi</b>', 'toString', '__proto__', ['github_failed', 'x']]) {
    assert.equal(profileErrorMessage(v), GENERIC);
  }
  assert.equal(profileErrorMessage(undefined), undefined);
  assert.equal(profileErrorMessage(''), undefined);
});

it('the profile page maps ?error=, and the callbacks send codes, not text', () => {
  const page = readFileSync('app/talent/profile/page.tsx', 'utf8');
  assert.doesNotMatch(page, /error=\{error\}/);
  assert.match(page, /profileErrorMessage\(error\)/);
  for (const p of ['github', 'linkedin']) {
    const cb = readFileSync(`app/talent/auth/${p}/callback/route.ts`, 'utf8');
    assert.doesNotMatch(cb, /\?error=\$\{encodeURIComponent/);
    assert.doesNotMatch(cb, /error\.message/);
  }
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';

it('Fill is a real button under a full-width box, and it spins while reading', () => {
  const src = readFileSync('components/Roles.tsx', 'utf8');
  assert.match(src, /aria-label="Job description" className="input block w-full" rows=\{8\}/);
  assert.match(src, /className="btn text-sm" disabled=\{reading \|\| !pasted\.trim\(\)\}/);
  assert.match(src, /reading \? <><Spinner \/>Reading…<\/>/);
});

it('Browse and Find spin from the click until the results arrive', () => {
  const form = readFileSync('components/SearchForm.tsx', 'utf8');
  assert.match(form, /start\(\(\) => router\.push\(/);
  assert.match(form, /disabled=\{pending\}>\{pending && <Spinner \/>\}/);
  const page = readFileSync('app/talent/search/page.tsx', 'utf8');
  assert.equal(page.match(/<SearchForm /g)?.length, 2);
  assert.doesNotMatch(page, /<form /);
});

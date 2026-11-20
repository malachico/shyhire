import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { legacyDate, monthValue } from '../lib/months.ts';

describe('experience dates (UX #19)', () => {
  it('shows YYYY-MM in the month input and keeps older free-text dates visible instead of dropping them', () => {
    assert.equal(monthValue('2021-03'), '2021-03');
    assert.equal(monthValue(' 2021-03 '), '2021-03');
    for (const v of ['', '2020', 'Jan 2019', '2021-13', 'Present']) assert.equal(monthValue(v), '', v);
    assert.equal(legacyDate('Jan 2019'), 'Jan 2019');
    assert.equal(legacyDate('2020'), '2020');
    for (const v of ['', '2021-03', 'present', 'Current']) assert.equal(legacyDate(v), '', v);
  });

  it('the editor uses month inputs and shows Writing… only for the AI write', () => {
    const src = readFileSync('components/TalentProfileEditor.tsx', 'utf8');
    assert.equal(src.match(/type="month"/g)?.length, 2);
    assert.match(src, /\{writing \? 'Writing…' : '✨ Write with AI'\}/);
    assert.doesNotMatch(src, /busy \? 'Writing…'/);
  });
});

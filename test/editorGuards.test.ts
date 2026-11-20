import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { draftToLose, factsToLose, roleHasContent } from '../lib/editorGuards.ts';
import type { Experience } from '../lib/types.ts';

const role = (over: Partial<Experience> = {}): Experience => ({ id: 'r1', title: '', company: '', start: '', end: '', description: '', hidden: false, source: 'self', ...over });
const empty = { headline: '', about: '', experience: [] as Experience[], facts: [] };

describe('profile editor guards', () => {
  it('asks only when there is content to lose', () => {
    assert.equal(factsToLose([]), false);
    assert.equal(factsToLose([{ id: 'f', text: '  ', source: 'cv' }]), false, 'blank facts need no confirm');
    assert.equal(factsToLose([{ id: 'f', text: 'Built a billing service', source: 'cv' }]), true);

    assert.equal(roleHasContent(role()), false, 'a freshly added role removes without asking');
    assert.equal(roleHasContent(role({ title: 'Backend engineer' })), true);
    assert.equal(roleHasContent(role({ description: 'Go services' })), true);

    assert.equal(draftToLose(empty), false);
    assert.equal(draftToLose({ ...empty, experience: [role()] }), false);
    assert.equal(draftToLose({ ...empty, headline: 'Backend engineer' }), true);
    assert.equal(draftToLose({ ...empty, experience: [role({ start: '2020-01' })] }), true);
    assert.equal(draftToLose({ ...empty, facts: [{ id: 'f', text: 'Led a team', source: 'cv' }] }), true);
  });
});

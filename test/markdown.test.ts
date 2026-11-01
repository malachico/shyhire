import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from '../components/Markdown.ts';

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

it('renders agent markdown: bold, numbered lists, soft line breaks kept as text', () => {
  const out = html('Hi @Candidate #1567f346\n\n**Questions:**\n\n1. Stack?\n2. Team size?\n\nline one\nline two');
  assert.match(out, /<strong>Questions:<\/strong>/);
  assert.match(out, /<ol>\s*<li>Stack\?<\/li>\s*<li>Team size\?<\/li>\s*<\/ol>/);
  assert.doesNotMatch(out, /\*\*/);
  assert.match(out, /line one\nline two/);
});

it('never fetches or links out from agent text: an image or link could reveal the viewer', () => {
  const out = html('![x](https://evil.test/p.gif) [site](https://evil.test) <https://evil.test> <img src="https://evil.test/q.gif"> <script>alert(1)</script>');
  assert.doesNotMatch(out, /<img|<a |<script/);
  assert.match(out, /site/);
});

it('both salary fields read as free text, up to the 200 characters the server takes', () => {
  for (const file of ['components/Roles.tsx', 'components/CandidateResults.tsx']) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /maxLength=\{200\} placeholder="e\.g\. 150–200k ILS, flexible/, file);
    assert.match(src, /Free text, recommended\./, file);
  }
});

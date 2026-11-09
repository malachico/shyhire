import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// ponytail: compiles the real .tsx with the installed typescript; use a DOM test runner if UI tests multiply.
const M = Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string; _extensions: Record<string, (m: { _compile(c: string, f: string): void }, f: string) => void> };
const resolveFilename = M._resolveFilename;
const stub = resolve('test/conversationView.stub.cjs');
M._resolveFilename = (r, ...a) => r === 'next/navigation' || r === '@/lib/actions/rooms' ? stub : resolveFilename(r.startsWith('@/') ? resolve(r.slice(2)) : r, ...a);
const compile: (typeof M._extensions)[string] = (m, f) => m._compile(ts.transpileModule(readFileSync(f, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, f);
M._extensions['.tsx'] = compile;
M._extensions['.ts'] = compile;
const { ConversationView } = createRequire(import.meta.url)('../components/ConversationView.tsx');

const room = (over: object) => ({
  id: 'r1', viewerSide: 'company', status: 'talking', candidateAlias: 'Candidate #a1b2c3d4', companyName: 'acme.dev', messages: [],
  document: { version: 2, text: 'Backend role, remote, start in January.', myApproved: true, otherApproved: true }, ...over,
});
const render = (over: object) => renderToStaticMarkup(createElement(ConversationView, { room: room(over) }));

describe('ConversationView', () => {
  it('keeps the agreed summary visible once matched, without Approve or Pass', () => {
    const html = render({ status: 'agreed', revealedContact: { displayName: 'Dana' } });
    assert.match(html, /What you both agreed/);
    assert.match(html, /Backend role, remote, start in January\./);
    assert.match(html, /You both said yes/);
    assert.doesNotMatch(html, />Approve</);
    assert.doesNotMatch(html, />Pass</);
  });

  it('shows no agreed card before the match', () => {
    const html = render({ document: { version: 2, text: 'Draft', myApproved: false } });
    assert.doesNotMatch(html, /What you both agreed/);
    assert.match(html, />Approve</);
  });

  it('shows no agreed card on a match with no summary', () => {
    assert.doesNotMatch(render({ status: 'agreed', document: undefined }), /What you both agreed/);
  });

  it('a decision pending on the other side reads as waiting, not ready to approve', () => {
    // getRoomView fills waitingOn for whoever decides, but needsDecision only for my own side.
    const html = render({ waitingOn: 'candidate', document: { version: 2, text: 'Draft', myApproved: false } });
    assert.match(html, /Waiting for them to answer their agent/);
    assert.doesNotMatch(html, />Approve</);
  });
});

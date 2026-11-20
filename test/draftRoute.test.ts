import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Same module hook as conversationView.test.ts: auth, talent and profiles are stubbed so the draft call fails unexpectedly.
const M = Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string; _extensions: Record<string, (m: { _compile(c: string, f: string): void }, f: string) => void> };
const resolveFilename = M._resolveFilename;
const stub = resolve('test/draftRoute.stub.cjs');
M._resolveFilename = (r, ...a) => ['@/lib/auth', '@/lib/talent', '@/lib/profiles'].includes(r) ? stub : r === '@/lib/upload' ? resolve('lib/upload.ts') : resolveFilename(r, ...a);
M._extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, f);
const { POST } = createRequire(import.meta.url)('../app/api/talent/draft/route.ts');

test('the draft route answers JSON {error} with 500 when drafting fails unexpectedly', async () => {
  const errors: unknown[] = [], log = console.error;
  console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    const res: Response = await POST(new Request('http://app.test/api/talent/draft', { method: 'POST', headers: { origin: 'http://app.test', host: 'app.test', 'content-type': 'application/json' }, body: JSON.stringify({ text: 'cv' }) }));
    assert.equal(res.status, 500);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    assert.deepEqual(await res.json(), { error: 'Could not read it. Nothing was changed.' });
    assert.equal(errors.length, 1);
  } finally { console.error = log; }
});

test('the draft route takes a max-size PDF, rejects one byte more with the shared limit, and fits under Vercel', async () => {
  const { MAX_PDF_BYTES, MAX_PDF_LABEL, MAX_DRAFT_BODY_BYTES, VERCEL_BODY_LIMIT_BYTES } = await import('../lib/upload.ts');
  assert.ok(MAX_DRAFT_BODY_BYTES < VERCEL_BODY_LIMIT_BYTES);
  const post = (body: string) => POST(new Request('http://app.test/api/talent/draft', { method: 'POST', headers: { origin: 'http://app.test', host: 'app.test' }, body }));
  const log = console.error;
  console.error = () => {};
  try {
    const maxPdf = JSON.stringify({ pdf: Buffer.alloc(MAX_PDF_BYTES).toString('base64') });
    assert.ok(maxPdf.length <= MAX_DRAFT_BODY_BYTES);
    assert.notEqual((await post(maxPdf)).status, 413);
    const tooBig: Response = await post('x'.repeat(MAX_DRAFT_BODY_BYTES + 1));
    assert.equal(tooBig.status, 413);
    assert.deepEqual(await tooBig.json(), { error: `Choose a PDF up to ${MAX_PDF_LABEL}` });
  } finally { console.error = log; }
});

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
M._resolveFilename = (r, ...a) => ['@/lib/auth', '@/lib/talent', '@/lib/profiles'].includes(r) ? stub : resolveFilename(r, ...a);
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

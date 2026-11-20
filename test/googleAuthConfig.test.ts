import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import ts from 'typescript';

// Same loader trick as conversationView.test.ts: the routes use '@/…' imports, so compile them as CommonJS.
const M = Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string; _extensions: Record<string, (m: { _compile(c: string, f: string): void }, f: string) => void> };
const resolveFilename = M._resolveFilename;
M._resolveFilename = (r, ...a) => resolveFilename(r.startsWith('@/') ? resolve(r.slice(2)) : r, ...a);
const compile: (typeof M._extensions)[string] = (m, f) => m._compile(ts.transpileModule(readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, f);
M._extensions['.ts'] = compile;
const load = createRequire(import.meta.url);

describe('Google sign-in without config', () => {
  it('start and callback send the person home with error=auth_unavailable instead of a bare 503', async () => {
    delete process.env.TALENT_GOOGLE_CLIENT_ID;
    delete process.env.APP_URL;
    const start = await load('../app/talent/auth/google/start/route.ts').GET(new Request('https://shyhire.test/talent/auth/google/start?as=hire'));
    assert.equal(start.status, 307);
    assert.equal(start.headers.get('location'), 'https://shyhire.test/?error=auth_unavailable');
    const callback = await load('../app/talent/auth/google/callback/route.ts').POST(new Request('https://shyhire.test/talent/auth/google/callback', { method: 'POST' }));
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get('location'), 'https://shyhire.test/?error=auth_unavailable');
  });
});

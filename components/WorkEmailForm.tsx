'use client';
import { useState } from 'react';
import { confirmWorkEmail, requestWorkEmail } from '@/lib/actions/talent';

export function WorkEmailForm() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const input = 'mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-base';
  async function request() {
    setBusy(true); setError('');
    try {
      const result = await requestWorkEmail(email);
      if (result.error) setError(result.error);
      else { setSentTo(email.trim()); setCode(''); }
    } catch { setError('Could not send the code. Try again.'); }
    finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setError('');
    try {
      const result = await confirmWorkEmail(code);
      if (result.error) setError(result.error);
      else setVerified(true);
    } catch { setError('Could not verify the code. Try again.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto w-full max-w-lg px-5 py-12">
    <a href="/talent/profile" className="text-sm underline">Back to profile</a>
    <h1 className="mt-8 text-3xl font-semibold tracking-tight">Verify your work email</h1>
    <p className="mt-4 text-sm text-[var(--muted)]">This confirms access to a mailbox, not employment. Your domain stays private and is automatically blocked from matching. Companies see only “Work email verified.” Your sign-in email and workspace access stay the same.</p>
    {error && <p role="alert" className="mt-5 text-sm text-[var(--bad-fg)]">{error}</p>}
    {verified ? <div role="status" className="mt-8"><p className="font-medium">Work email verified.</p><a href="/talent/profile" className="btn-primary mt-5 inline-flex">Return to profile</a></div> : <>
      <form className="mt-8" onSubmit={(event) => { event.preventDefault(); void request(); }}>
        <label className="block text-sm">Work email<input type="email" autoComplete="email" maxLength={254} required disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} className={input} /></label>
        <button className="btn mt-4" disabled={busy}>{busy ? 'Please wait…' : sentTo ? 'Send another code' : 'Send code'}</button>
        <p className="mt-2 text-xs text-[var(--muted)]">Use your company address. At most one code per minute and five per hour. Each new code replaces the previous one.</p>
      </form>
      {sentTo && <form className="mt-8 border-t border-[var(--border)] pt-6" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
        <p role="status" className="break-words text-sm">Code sent to {sentTo}.</p>
        <label className="mt-4 block text-sm">Six-digit code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy} value={code} onChange={(event) => setCode(event.target.value)} className={input} /></label>
        <p className="mt-2 text-xs text-[var(--muted)]">Expires in 10 minutes. Five attempts per code.</p>
        <button className="btn-primary mt-4" disabled={busy}>{busy ? 'Please wait…' : 'Verify email'}</button>
      </form>}
    </>}
  </main>;
}

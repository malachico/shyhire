'use client';
import { useEffect, useState } from 'react';
import { confirmWorkEmail, requestWorkEmail } from '@/lib/actions/talent';

/** Email, then a 6-digit code. The hub allows one code a minute; the resend link says when. */
export function WorkEmailForm({ next, hiring }: { next: { href: string; label: string }; hiring: boolean }) {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState('');
  const [wait, setWait] = useState(0);
  useEffect(() => { if (wait > 0) { const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); } }, [wait]);

  async function send(to: string) {
    setBusy(true); setError('');
    try {
      const r = await requestWorkEmail(to);
      if (r.error) setError(r.error);
      else { setSentTo(to.trim()); setCode(''); setWait(60); }
    } catch { setError('Could not send the code. Try again.'); }
    finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setError('');
    try {
      const r = await confirmWorkEmail(code);
      if (r.error) setError(r.error);
      else setVerified(sentTo.split('@')[1] ?? '');
    } catch { setError('Could not check the code. Try again.'); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-md px-4 py-12">
    <h1 className="text-2xl font-semibold tracking-tight">Verify your work email</h1>
    <p className="muted mt-2 text-sm">{hiring ? 'Candidates see your company name, so it has to be real.' : 'Adds a "Work email verified" badge. Your domain stays private and that employer is blocked from finding you.'}</p>
    {error && <p role="alert" className="mt-5 rounded-lg bg-[var(--bad-bg)] p-3 text-sm text-[var(--bad-fg)]">{error}</p>}
    {verified ? <div role="status" className="card mt-6">
      <p className="font-semibold">You&apos;re verified as {verified}.</p>
      <a href={next.href} className="btn-primary mt-4">{next.label}</a>
    </div> : !sentTo ? <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); void send(email); }}>
      <label className="field">Work email<input type="email" autoComplete="email" maxLength={254} required disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@company.com" /><span className="hint block">Your company address, not Gmail, Outlook or another personal email.</span></label>
      <button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
    </form> : <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); void confirm(); }}>
      <p role="status" className="text-sm">We sent a 6-digit code to <span className="font-medium break-all">{sentTo}</span>.</p>
      <label className="field">Code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy} value={code} onChange={(e) => setCode(e.target.value)} className="input tracking-[0.3em]" /><span className="hint block">Expires in 10 minutes.</span></label>
      <button className="btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Verify'}</button>
      <p className="muted flex flex-wrap gap-4 text-sm">
        <button type="button" className="underline" disabled={busy} onClick={() => { setSentTo(''); setError(''); }}>Change email</button>
        <button type="button" className="underline disabled:no-underline" disabled={busy || wait > 0} onClick={() => void send(sentTo)}>{wait > 0 ? `Resend in ${wait}s` : 'Send a new code'}</button>
      </p>
    </form>}
  </main>;
}

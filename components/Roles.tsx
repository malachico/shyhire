'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createRole, setRoleStatus } from '@/lib/actions/roles';

/** Describe a role once; the company's agent finds good fits and starts talking to them. */
export function RoleForm({ first }: { first: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(first);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  if (!open) return <button type="button" className="btn-primary" onClick={() => setOpen(true)}>+ New role</button>;
  return <form className="card space-y-4" onSubmit={(e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { title: String(f.get('title') ?? ''), looking: String(f.get('looking') ?? ''), comp: String(f.get('comp') ?? ''), mustHaves: String(f.get('mustHaves') ?? '') };
    setError(''); setDone('');
    start(async () => {
      const r = await createRole(body);
      if ('error' in r && r.error) { setError(r.error); return; }
      const n = 'opened' in r ? r.opened ?? 0 : 0;
      setDone(n ? `Your agent started ${n} conversation${n === 1 ? '' : 's'}. You'll hear when someone needs you.` : "Role is open. No strong fits yet; your agent checks again every day.");
      setOpen(first); router.refresh();
    });
  }}>
    <div><h2 className="font-semibold">New role</h2><p className="muted text-sm">Your agent talks to the best fits now, then a few more each day. You only hear when it needs you or there&apos;s a mutual yes.</p></div>
    <label className="field">Role title<input className="input" name="title" required maxLength={200} placeholder="Senior backend engineer" /></label>
    <label className="field">Who you&apos;re looking for<textarea className="input min-h-24" name="looking" required maxLength={2000} placeholder="Payments or fintech background, Go and Postgres in production, remote within EU hours" /></label>
    <label className="field">Salary band<input className="input" name="comp" maxLength={200} placeholder="$170k–$200k" /></label>
    <label className="field">Private notes for your agent<textarea className="input min-h-20" name="mustHaves" maxLength={2000} placeholder="Must be able to start within 2 months. Can stretch to $210k for someone exceptional." /><span className="hint block">Only your agent sees these.</span></label>
    {error && <p role="alert" className="text-sm text-[var(--bad-fg)]">{error}</p>}
    <div className="flex items-center gap-3">
      <button className="btn-primary" disabled={pending}>{pending ? 'Finding fits…' : 'Start'}</button>
      {!first && <button type="button" className="muted text-sm underline" onClick={() => setOpen(false)}>Cancel</button>}
    </div>
    {done && <p role="status" className="text-sm">{done}</p>}
  </form>;
}

export function RoleActions({ id, status }: { id: string; status: 'open' | 'paused' | 'closed' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (s: 'open' | 'paused' | 'closed') => start(async () => { await setRoleStatus(id, s); router.refresh(); });
  return <div className="flex gap-3 text-sm">
    <button type="button" className="underline underline-offset-4" disabled={pending} onClick={() => set(status === 'open' ? 'paused' : 'open')}>{status === 'open' ? 'Pause' : 'Resume'}</button>
    <button type="button" className="muted underline underline-offset-4" disabled={pending} onClick={() => set('closed')}>Close</button>
  </div>;
}

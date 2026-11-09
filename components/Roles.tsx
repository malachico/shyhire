'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createRole, createRoleAndTalk, readRoleDescription, setRoleStatus, updateRole } from '@/lib/actions/roles';
import type { RoleDraft } from '@/lib/profiles';
import type { Role } from '@/lib/roles';
import type { WorkMode } from '@/lib/types';
import { Spinner } from './SearchForm';

const WORK_MODES: { mode: WorkMode; label: string }[] = [{ mode: 'remote', label: 'Remote' }, { mode: 'hybrid', label: 'Hybrid' }, { mode: 'onsite', label: 'Onsite' }];
const BLANK: RoleDraft = { title: '', looking: '', location: '', workModes: [], comp: '', mustHaves: '' };

/** Describe a role once, or paste its job description; the company's agent finds good fits and starts talking to them. With `role`, edits it. With `talk`, the new role opens that candidate's conversation first. */
export function RoleForm({ first = false, role, talk }: { first?: boolean; role?: Pick<Role, 'id' | 'title' | 'looking' | 'location' | 'workModes' | 'comp' | 'mustHaves'>; talk?: { alias: string; query: string; onCancel: () => void } }) {
  const router = useRouter();
  const [open, setOpen] = useState(first || !!role || !!talk);
  const [pending, start] = useTransition();
  const [reading, startReading] = useTransition();
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [pasted, setPasted] = useState('');
  const [filled, setFilled] = useState(false);
  const [draft, setDraft] = useState<RoleDraft>(role ? { ...BLANK, ...role } : talk ? { ...BLANK, title: talk.query.slice(0, 200), looking: talk.query.slice(0, 2000) } : BLANK);
  // The fields stay uncontrolled: a new version remounts them with the new draft.
  const [version, setVersion] = useState(0);
  const fill = (next: RoleDraft) => { setDraft(next); setVersion((v) => v + 1); };
  if (!open) return <>{done && <p role="status" className="text-sm">{done}</p>}<button type="button" className="btn-primary" onClick={() => setOpen(true)}>+ New role</button></>;
  return <form className={talk ? 'space-y-4' : role ? 'mt-3 space-y-4' : 'card space-y-4'} onSubmit={(e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: RoleDraft = { title: String(f.get('title') ?? ''), looking: String(f.get('looking') ?? ''), location: String(f.get('location') ?? ''), workModes: f.getAll('workModes') as WorkMode[], comp: String(f.get('comp') ?? ''), mustHaves: String(f.get('mustHaves') ?? '') };
    setError(''); setDone('');
    start(async () => {
      if (role) {
        const r = await updateRole(role.id, body);
        if (r.error) { setError(r.error); return; }
        setDone('Saved.'); router.refresh();
        return;
      }
      if (talk) {
        const r = await createRoleAndTalk(body, talk.alias);
        if (r.error !== undefined) setError(r.error); else router.push(`/talent/conversations/${encodeURIComponent(r.id)}`);
        return;
      }
      const r = await createRole(body);
      if ('error' in r && r.error) { setError(r.error); return; }
      const n = 'opened' in r ? r.opened ?? 0 : 0;
      setDone(n ? `Your agent started ${n} conversation${n === 1 ? '' : 's'}. You'll hear when someone needs you.` : "Role is open. No strong fits yet; your agent checks again every day.");
      setOpen(false); fill(BLANK); setFilled(false); router.refresh();
    });
  }}>
    {role
      ? <p className="muted text-sm">Changes apply to new conversations only.</p>
      : <>
        <div><h2 className="font-semibold">New role</h2><p className="muted text-sm">Your agent talks to the best fits now, then a few more each day. You only hear when it needs you or there&apos;s a mutual yes.</p></div>
        <details>
          <summary className="cursor-pointer text-sm font-medium">Have a job description? Paste it</summary>
          <div className="mt-2 space-y-2">
            <textarea aria-label="Job description" className="input block w-full" rows={8} maxLength={40000} value={pasted} onChange={(e) => setPasted(e.target.value)} />
            <button type="button" className="btn text-sm" disabled={reading || !pasted.trim()} onClick={() => {
              setError(''); setFilled(false);
              startReading(async () => {
                const r = await readRoleDescription(pasted);
                if ('draft' in r) { fill(r.draft); setPasted(''); setFilled(true); } else setError(r.error);
              });
            }}>{reading ? <><Spinner />Reading…</> : 'Fill in the form'}</button>
            <p className="hint">We read it once and don&apos;t keep it.</p>
          </div>
        </details>
        {filled && <p role="status" className="text-sm">Check each field below, and take out anything that names your company. Nothing happens until you press Start.</p>}
      </>}
    <div key={version} className="space-y-4">
      <label className="field">Role title<input className="input" name="title" required maxLength={200} defaultValue={draft.title} placeholder="Senior backend engineer" /></label>
      <label className="field">Who you&apos;re looking for<textarea className="input min-h-24" name="looking" required maxLength={2000} defaultValue={draft.looking} placeholder="Payments or fintech background, Go and Postgres in production, remote within EU hours" /></label>
      <label className="field">Location<input className="input" name="location" maxLength={200} defaultValue={draft.location} placeholder="Tel Aviv, or EU time zones" /><span className="hint block">Your agent can share this with candidates.</span></label>
      <fieldset className="field">
        <legend>Work mode</legend>
        <div className="flex flex-wrap gap-4">{WORK_MODES.map(({ mode, label }) => <label key={mode} className="flex items-center gap-2 text-sm"><input type="checkbox" name="workModes" value={mode} defaultChecked={draft.workModes.includes(mode)} />{label}</label>)}</div>
      </fieldset>
      <label className="field">Salary<input className="input" name="comp" maxLength={200} placeholder="e.g. 150–200k ILS, flexible · or $180k–$210k + equity" defaultValue={draft.comp} /><span className="hint block">Free text, recommended.</span></label>
      <label className="field">Private notes for your agent<textarea className="input min-h-20" name="mustHaves" maxLength={2000} defaultValue={draft.mustHaves} placeholder="Must be able to start within 2 months. Can stretch to $210k for someone exceptional." /><span className="hint block">Only your agent sees these.</span></label>
    </div>
    {error && <p role="alert" className="text-sm text-[var(--bad-fg)]">{error}</p>}
    <div className="flex items-center gap-3">
      <button className="btn-primary" disabled={pending}>{role ? (pending ? 'Saving…' : 'Save') : (pending ? 'Finding fits…' : 'Start')}</button>
      {!first && !role && <button type="button" className="muted text-sm underline" disabled={pending} onClick={() => talk ? talk.onCancel() : setOpen(false)}>Cancel</button>}
    </div>
    {done && <p role="status" className="text-sm">{done}</p>}
  </form>;
}

export function RoleActions({ id, status }: { id: string; status: 'open' | 'paused' | 'closed' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (s: 'open' | 'paused' | 'closed') => start(async () => { await setRoleStatus(id, s); router.refresh(); });
  return <div className="flex gap-3 text-sm">
    <button type="button" className="underline underline-offset-4" disabled={pending} onClick={() => set(status === 'open' ? 'paused' : 'open')}>{status === 'open' ? 'Pause' : status === 'paused' ? 'Resume' : 'Reopen'}</button>
    {status !== 'closed' && <button type="button" className="muted underline underline-offset-4" disabled={pending} onClick={() => set('closed')}>Close</button>}
  </div>;
}

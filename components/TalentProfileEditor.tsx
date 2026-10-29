'use client';
import { useState } from 'react';
import type { Experience, ProfileDraft, TalentProfile, WorkMode } from '@/lib/talent';
import { saveTalentProfile, setDiscoverable } from '@/lib/actions/talent';
import { privacyLeaks } from '@/lib/privacy';
import { Mark } from '@/components/Brand';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS', 'CAD', 'AUD', 'CHF', 'SGD'] as const;
const WORK_MODES: { mode: WorkMode; label: string }[] = [
  { mode: 'remote', label: 'Remote' },
  { mode: 'hybrid', label: 'Hybrid' },
  { mode: 'onsite', label: 'Onsite' },
];
const list = (s: string) => s.split(',').map((v) => v.trim()).filter(Boolean);

type Props = {
  initial: TalentProfile;
  me: { name: string; email: string };
  error?: string;
  githubAvailable?: boolean;
  linkedinAvailable?: boolean;
  workEmailAvailable?: boolean;
  importAvailable?: boolean;
};

/**
 * The candidate's profile. A new one goes through three steps (experience, check it, what matters); a saved one
 * shows what companies see, the connections, and the same fields to edit. The anonymous summary companies get is
 * computed on the server from fixed lists, never from this text.
 */
export function TalentProfileEditor({ initial, me, error: initialError, githubAvailable = true, linkedinAvailable = true, workEmailAvailable = false, importAvailable = true }: Props) {
  const [profile, setProfile] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [step, setStep] = useState<1 | 2 | 3>(initial.headline || initial.experience.length ? 2 : 1);
  const [domains, setDomains] = useState(initial.employerDomains.join(', '));
  const [locationsText, setLocationsText] = useState((initial.locations ?? []).join(', '));
  const [salaryMin, setSalaryMin] = useState(initial.salary?.min !== undefined ? String(initial.salary.min) : '');
  const [currency, setCurrency] = useState(initial.salary?.currency || initial.salaryCurrency || 'USD');
  const [source, setSource] = useState('');
  const [file, setFile] = useState<File>();
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? '');
  const [notice, setNotice] = useState('');
  const onboarded = saved.version > 0;
  const change = (f: Partial<TalentProfile>) => { setProfile((p) => ({ ...p, ...f })); setNotice(''); };
  const role = (id: string, f: Partial<Experience>) => change({ experience: profile.experience.map((r) => (r.id === id ? { ...r, ...f } : r)) });
  const toggleMode = (mode: WorkMode, on: boolean) => {
    const s = new Set(profile.workModes ?? []);
    if (on) s.add(mode); else s.delete(mode);
    change({ workModes: WORK_MODES.map((w) => w.mode).filter((m) => s.has(m)) });
  };
  const leaks = privacyLeaks([profile.headline, profile.about, ...profile.experience.map((r) => r.description)].join('\n'), me, list(domains));

  async function save(): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try {
      const { version, headline, about, experience, openTo, workModes, noGos } = profile;
      const r = await saveTalentProfile({ version, headline, about, experience, openTo, salary: { min: salaryMin.trim() ? Number(salaryMin) : null, currency }, locations: list(locationsText), workModes, noGos, employerDomains: list(domains) });
      if (r.error || !r.profile) { setError(r.error ?? 'Could not save.'); return false; }
      setProfile(r.profile); setSaved(r.profile);
      setDomains(r.profile.employerDomains.join(', ')); setLocationsText(r.profile.locations.join(', '));
      setSalaryMin(r.profile.salary.min !== undefined ? String(r.profile.salary.min) : ''); setCurrency(r.profile.salary.currency);
      setNotice('Saved.');
      return true;
    } catch { setError('Could not save. Your edits are still here; try again.'); return false; }
    finally { setBusy(false); }
  }

  async function importDraft() {
    setBusy(true); setError('');
    try {
      if (file && (file.type !== 'application/pdf' || file.size > 3 * 1024 * 1024)) throw new Error('Choose a PDF up to 3 MB');
      const pdf = file ? btoa(Array.from(new Uint8Array(await file.arrayBuffer()), (b) => String.fromCharCode(b)).join('')) : undefined;
      const res = await fetch('/api/talent/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pdf ? { pdf } : source.trim() ? { text: source } : {}) });
      const r = await res.json() as { draft?: ProfileDraft; error?: string };
      if (r.error) setError(r.error);
      else if (r.draft) { change(r.draft); setStep(2); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read it. Nothing was changed.'); }
    finally { setBusy(false); }
  }

  async function toggleOpen() {
    setBusy(true); setError('');
    try {
      const r = await setDiscoverable(!!saved.paused);
      if (r.error || !r.profile) setError(r.error ?? 'Could not change it.');
      else { setSaved(r.profile); setProfile((p) => ({ ...p, paused: r.profile!.paused })); }
    } finally { setBusy(false); }
  }

  const dirty = JSON.stringify({ ...profile, paused: saved.paused }) !== JSON.stringify(saved) || domains !== saved.employerDomains.join(', ') || locationsText !== saved.locations.join(', ') || salaryMin !== (saved.salary.min !== undefined ? String(saved.salary.min) : '') || currency !== saved.salary.currency;
  const banner = (error || notice) ? <div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-[var(--bad-bg)] p-3 text-sm text-[var(--bad-fg)]">{error}</p>}
    {notice && <p role="status" className="muted mb-4 text-sm">{notice}</p>}
  </div> : null;

  const experienceStep = <section aria-label="Add your experience" className="space-y-4">
    {importAvailable ? <>
      {!pasting ? <label className="card block cursor-pointer text-center hover:border-[var(--accent)]">
        <span className="font-semibold">{file ? file.name : 'Upload your CV or LinkedIn PDF'}</span>
        <span className="hint block">From LinkedIn: open your profile → More → Save to PDF. On a phone, switch Chrome to “Desktop site” first.</span>
        <input type="file" accept="application/pdf" className="sr-only" aria-label="CV or LinkedIn PDF" disabled={busy} onChange={(e) => setFile(e.target.files?.[0])} />
      </label> : <label className="field">Paste your CV or LinkedIn text<textarea className="input min-h-40" maxLength={40000} disabled={busy} value={source} onChange={(e) => setSource(e.target.value)} /></label>}
      <p className="hint">We read it once to fill in your profile and don&apos;t keep the file.</p>
      <div className="flex flex-wrap items-center gap-4">
        <button className="btn-primary" disabled={busy || (!file && !source.trim())} onClick={() => void importDraft()}>{busy ? 'Reading…' : 'Continue'}</button>
        <button className="muted text-sm underline" disabled={busy} onClick={() => { setPasting(!pasting); setFile(undefined); }}>{pasting ? 'Upload a PDF instead' : 'Paste text instead'}</button>
      </div>
    </> : <p className="muted text-sm">CV import isn&apos;t available right now. Fill in your profile by hand.</p>}
    <p className="muted text-sm">
      {githubAvailable && <><a className="link" href="/talent/auth/github/start">Connect GitHub</a> to add your public activity (personal account only) · </>}
      <button className="underline" onClick={() => setStep(2)}>Fill it in by hand</button>
    </p>
  </section>;

  const profileFields = <fieldset disabled={busy} className="space-y-4">
    <label className="field">Headline<input className="input" maxLength={200} value={profile.headline} onChange={(e) => change({ headline: e.target.value })} placeholder="Senior backend engineer, Go and Postgres" /></label>
    <label className="field">About<textarea className="input min-h-24" maxLength={6000} value={profile.about} onChange={(e) => change({ about: e.target.value })} /></label>
    {profile.experience.map((r, i) => <div key={r.id} className="card space-y-3" aria-label={`Role ${i + 1}`}>
      <label className="field">Role<input className="input" maxLength={200} value={r.title} onChange={(e) => role(r.id, { title: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="field">From<input className="input" maxLength={30} value={r.start} onChange={(e) => role(r.id, { start: e.target.value })} /></label>
        <label className="field">To<input className="input" maxLength={30} value={r.end} onChange={(e) => role(r.id, { end: e.target.value })} placeholder="Present" /></label>
      </div>
      <label className="field">What you did<textarea className="input min-h-20" maxLength={4000} value={r.description} onChange={(e) => role(r.id, { description: e.target.value })} /></label>
      <div className="flex justify-between text-sm"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={r.hidden} onChange={(e) => role(r.id, { hidden: e.target.checked })} /> Hide from matching</label><button type="button" className="muted underline" onClick={() => change({ experience: profile.experience.filter((x) => x.id !== r.id) })}>Remove</button></div>
    </div>)}
    <button type="button" className="btn text-sm" disabled={profile.experience.length >= 40} onClick={() => change({ experience: [...profile.experience, { id: crypto.randomUUID(), title: '', company: '', start: '', end: '', description: '', hidden: false, source: 'self' }] })}>Add a role</button>
    <label className="field">Open to<input className="input" maxLength={500} value={profile.openTo} onChange={(e) => change({ openTo: e.target.value })} placeholder="Full-time, contract" /></label>
    <label className="field">Never show me to<input className="input" value={domains} onChange={(e) => { setDomains(e.target.value); setNotice(''); }} placeholder="current-employer.com" /><span className="hint block">Companies on these domains, and your verified work domain, never see you.</span></label>
    {!!leaks.length && <p role="alert" className="rounded-lg bg-[#fffaeb] p-3 text-sm text-[#93370d]">Your text mentions {leaks.join(', ')}. Companies only see an anonymous summary, but remove it to be safe.</p>}
  </fieldset>;

  const preferenceFields = <fieldset disabled={busy} className="space-y-4">
    <p className="muted text-sm">Private. Only your agent sees this, to say no for you.</p>
    <div className="grid grid-cols-[1fr_7rem] gap-3">
      <label className="field">Minimum salary (yearly)<input className="input" type="number" min={1} max={10000000} step={1000} value={salaryMin} onChange={(e) => { setSalaryMin(e.target.value); setNotice(''); }} placeholder="180000" /></label>
      <label className="field">Currency<select className="input" value={currency} onChange={(e) => { setCurrency(e.target.value); setNotice(''); }}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
    </div>
    <label className="field">Locations<input className="input" value={locationsText} onChange={(e) => { setLocationsText(e.target.value); setNotice(''); }} placeholder="London, Tel Aviv" /></label>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Work mode">{WORK_MODES.map(({ mode, label }) => {
      const on = (profile.workModes ?? []).includes(mode);
      return <button key={mode} type="button" aria-pressed={on} onClick={() => toggleMode(mode, !on)} className={`pill min-h-9 px-3 text-sm ${on ? 'pill-accent' : ''}`}>{label}</button>;
    })}</div>
    <label className="field">No-gos<textarea className="input min-h-20" maxLength={1000} value={profile.noGos ?? ''} onChange={(e) => change({ noGos: e.target.value })} placeholder="No gambling, on-call at most a week a month" /></label>
  </fieldset>;

  const preview = <section aria-label="What companies see" className="rounded-[18px] bg-[var(--ink)] p-[18px] text-[var(--bg)]">
    <p className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--sun)]"><Mark size={30} flower={false} look="ahead" body="#3a3a3a" />What companies see</p>
    <p className="mt-2 text-[17px] font-semibold">{saved.alias || 'Candidate #…'}</p>
    <p className="mt-1 text-sm leading-relaxed text-[#DDD6CA]">{saved.publicSummary || profile.headline || 'Your anonymous summary appears here once you save.'}</p>
    <p className="mt-2 text-xs text-[#A8A196]">No name, employers, links or private preferences.{onboarded && dirty && ' Save to update.'}</p>
  </section>;

  if (!onboarded) {
    const titles = { 1: 'Add your experience', 2: 'Check your profile', 3: 'What matters to you' } as const;
    return <main className="mx-auto max-w-xl px-4 py-8">
      <p className="muted text-sm">Step {step} of 3</p>
      <div className="mt-2 h-1 rounded-full bg-[var(--border)]"><div className="h-1 rounded-full bg-[var(--accent)] transition-all" style={{ width: `${(step / 3) * 100}%` }} /></div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{titles[step]}</h1>
      <div className="mt-6">{banner}</div>
      {step === 1 && experienceStep}
      {step === 2 && <div className="space-y-6">{preview}{profileFields}<div className="flex items-center gap-4"><button className="btn-primary" disabled={busy || !profile.headline.trim()} onClick={() => setStep(3)}>Continue</button><button className="muted text-sm underline" onClick={() => setStep(1)}>Back</button></div></div>}
      {step === 3 && <div className="space-y-6">{preferenceFields}<div className="flex items-center gap-4"><button className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Start getting matched'}</button><button className="muted text-sm underline" onClick={() => setStep(2)}>Back</button></div></div>}
    </main>;
  }

  const has = (src: string) => profile.verified.some((v) => v.source === src);
  const connections = [
    { name: 'Google', status: me.email || 'Signed in', done: true },
    ...(workEmailAvailable ? [{ name: 'Work email', status: has('work-email') ? 'Verified' : 'Not verified', done: has('work-email'), href: '/talent/verify/work-email' }] : []),
    ...(githubAvailable ? [{ name: 'GitHub', status: has('github') ? 'Connected' : 'Not connected', done: has('github'), href: '/talent/auth/github/start' }] : []),
    ...(linkedinAvailable ? [{ name: 'LinkedIn', status: has('linkedin') ? 'Connected' : 'Not connected', done: has('linkedin'), href: '/talent/auth/linkedin/start' }] : []),
  ];
  return <main className="mx-auto max-w-xl px-4 py-8 space-y-6">
    {banner}
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-sm font-medium"><span className={`size-2 rounded-full ${saved.paused ? 'bg-[var(--muted)]' : 'bg-[#12b76a]'}`} />{saved.paused ? 'Paused' : 'Open to conversations'}</span>
      <button className="btn text-sm" disabled={busy} onClick={() => void toggleOpen()}>{saved.paused ? 'Resume' : 'Pause'}</button>
    </div>
    {preview}
    <section aria-label="Connections">
      <h2 className="mb-2 font-semibold">Connections</h2>
      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface)]">
        {connections.map((c) => <li key={c.name} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <span className="min-w-0"><span className="block font-medium">{c.name}</span><span className="muted block truncate">{c.done ? '✓ ' : ''}{c.status}</span></span>
          {'href' in c && c.href && <a className="btn min-h-9 text-sm" href={c.href}>{c.done ? 'Refresh' : 'Connect'}</a>}
        </li>)}
      </ul>
      <p className="hint mt-2">Connect only personal accounts. Never connect a GitHub or LinkedIn account your employer owns, and don’t upload company documents.</p>
    </section>
    <details><summary className="cursor-pointer font-semibold">Update from a CV or LinkedIn PDF</summary><div className="mt-4">{experienceStep}</div></details>
    <details><summary className="cursor-pointer font-semibold">Edit profile</summary><div className="mt-4">{profileFields}</div></details>
    <details><summary className="cursor-pointer font-semibold">What matters to you</summary><div className="mt-4">{preferenceFields}</div></details>
    {dirty && <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3"><button className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save changes'}</button><span className="muted text-sm">Unsaved changes</span></div>}
  </main>;
}

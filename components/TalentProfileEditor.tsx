'use client';
import { useState } from 'react';
import type { Experience, Fact, ProfileDraft, TalentProfile, WorkMode } from '@/lib/talent';
import { saveTalentProfile, setDiscoverable, writeSummary } from '@/lib/actions/talent';
import { privacyLeaks } from '@/lib/privacy';
import { Mark } from '@/components/Brand';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS', 'CAD', 'AUD', 'CHF', 'SGD'] as const;
const WORK_MODES: { mode: WorkMode; label: string }[] = [
  { mode: 'remote', label: 'Remote' },
  { mode: 'hybrid', label: 'Hybrid' },
  { mode: 'onsite', label: 'Onsite' },
];
const SOURCE: Record<Fact['source'], string> = { cv: 'CV', github: 'GitHub', linkedin: 'LinkedIn', 'work-email': 'Work email', stripe: 'Stripe', vercel: 'Vercel' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const when = (d: string) => { const m = /^(\d{4})-(\d{2})$/.exec(d); return m ? `${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}`.trim() : d; };
const list = (s: string) => s.split(',').map((v) => v.trim()).filter(Boolean);

type Props = {
  initial: TalentProfile;
  verifiedFacts: Fact[];
  me: { name: string; email: string };
  error?: string;
  githubAvailable?: boolean;
  linkedinAvailable?: boolean;
  workEmailAvailable?: boolean;
  importAvailable?: boolean;
};

/**
 * The candidate's profile. A new one goes through three steps (experience, check it, what matters); a saved one
 * shows what companies see, the connections, and the same fields to edit. Companies see a list of facts: verified ones
 * come from checked data (they can only hide them); their own CV facts the AI suggests and they edit freely.
 */
export function TalentProfileEditor({ initial, verifiedFacts, me, error: initialError, githubAvailable = true, linkedinAvailable = true, workEmailAvailable = false, importAvailable = true }: Props) {
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
  const [editing, setEditing] = useState<'' | 'facts' | 'experience' | 'import' | 'prefs'>('');
  const onboarded = saved.version > 0;
  const change = (f: Partial<TalentProfile>) => { setProfile((p) => ({ ...p, ...f })); setNotice(''); };
  const role = (id: string, f: Partial<Experience>) => change({ experience: profile.experience.map((r) => (r.id === id ? { ...r, ...f } : r)) });
  const toggleMode = (mode: WorkMode, on: boolean) => {
    const s = new Set(profile.workModes ?? []);
    if (on) s.add(mode); else s.delete(mode);
    change({ workModes: WORK_MODES.map((w) => w.mode).filter((m) => s.has(m)) });
  };
  const leaks = privacyLeaks(profile.facts.map((f) => f.text).join('\n'), me, list(domains)); // ponytail: employer names are checked on save

  async function save(): Promise<boolean> {
    setBusy(true); setError(''); setNotice('');
    try {
      const { version, headline, about, facts, hiddenFacts, experience, openTo, workModes, noGos } = profile;
      const r = await saveTalentProfile({ version, headline, about, facts, hiddenFacts, experience, openTo, salary: { min: salaryMin.trim() ? Number(salaryMin) : null, currency }, locations: list(locationsText), workModes, noGos, employerDomains: list(domains) });
      if (r.error || !r.profile) { setError(r.error ?? 'Could not save.'); return false; }
      setProfile(r.profile); setSaved(r.profile);
      setDomains(r.profile.employerDomains.join(', ')); setLocationsText(r.profile.locations.join(', '));
      setSalaryMin(r.profile.salary.min !== undefined ? String(r.profile.salary.min) : ''); setCurrency(r.profile.salary.currency);
      setNotice('Saved.'); setEditing('');
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
      else if (r.draft) { change(r.draft); setStep(2); setEditing('facts'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read it. Nothing was changed.'); }
    finally { setBusy(false); }
  }

  async function rewrite() {
    setBusy(true); setError('');
    try {
      const { headline, about, experience, openTo } = profile;
      const r = await writeSummary({ headline, about, experience, openTo });
      if ('error' in r && r.error) setError(r.error);
      else if ('facts' in r) change({ facts: r.facts });
    } catch { setError('Could not write it. Try again, or write it yourself.'); }
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
  </fieldset>;

  const preferenceFields = <fieldset disabled={busy} className="space-y-4">
    {!onboarded && <p className="muted text-sm">Private. Only your agent sees this, to say no for you.</p>}
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

  const factLine = (f: Fact) => <li key={f.id} className="flex gap-2.5">
    <span aria-hidden className={f.source === 'cv' ? 'text-[#8a847a]' : 'font-bold text-[var(--sun)]'}>{f.source === 'cv' ? '•' : '✓'}</span>
    <span>{f.text}</span>
  </li>;
  const shown = [...verifiedFacts.filter((f) => !profile.hiddenFacts.includes(f.id)), ...profile.facts.filter((f) => f.text.trim())];
  const preview = <section aria-label="What companies see" className="rounded-[20px] bg-[var(--ink)] p-5 text-[var(--bg)]">
    <div className="flex items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--sun)]"><Mark size={26} flower={false} look="ahead" body="#3a3a3a" />What companies see</p>
      {editing !== 'facts' && <button type="button" className="rounded-full bg-[var(--sun)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ink)]" onClick={() => setEditing('facts')}>Edit</button>}
    </div>
    <p className="mt-3 text-lg font-semibold">{saved.alias || 'Candidate #…'}</p>
    {shown.length
      ? <ul className="mt-2 space-y-1.5 text-[15px] leading-snug text-[#E9E3D8]">{shown.map(factLine)}</ul>
      : <p className="mt-2 text-sm text-[#A8A196]">Nothing yet. Add your experience and we&apos;ll write this for you.</p>}
    <p className="mt-4 text-xs text-[#A8A196]"><span className="font-bold text-[var(--sun)]">✓</span> checked by us · <span>•</span> from your CV · no name or employers</p>
  </section>;

  const factsEditor = <section aria-label="Edit what companies see" className="card space-y-5">
    <div className="flex items-start justify-between gap-3">
      <div><h2 className="font-semibold">What companies see</h2><p className="hint">Keep it short and concrete. No name, employers or links.</p></div>
      {onboarded && <button type="button" className="text-sm font-medium underline underline-offset-4" onClick={() => setEditing('')}>Done</button>}
    </div>
    {!!verifiedFacts.length && <div>
      <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Checked by us</p>
      <ul className="mt-2 divide-y divide-[var(--border)]">{verifiedFacts.map((f) => {
        const on = !profile.hiddenFacts.includes(f.id);
        return <li key={f.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className={on ? '' : 'muted line-through'}><span aria-hidden className="mr-2 font-bold text-[#12b76a]">✓</span>{f.text}</span>
          <button type="button" role="switch" aria-checked={on} aria-label={`Show: ${f.text}`} disabled={busy} onClick={() => change({ hiddenFacts: on ? [...profile.hiddenFacts, f.id] : profile.hiddenFacts.filter((id) => id !== f.id) })}
            className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-[var(--ink)]' : 'bg-[var(--border)]'}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} /></button>
        </li>;
      })}</ul>
    </div>}
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">From your CV</p>
      <ul className="mt-2 space-y-2">{profile.facts.map((f) => <li key={f.id} className="flex items-start gap-2">
        <textarea aria-label="Fact" rows={1} className="input field-sizing-content min-h-11 flex-1 resize-none py-2.5 text-sm" maxLength={300} disabled={busy} value={f.text} placeholder="Led a payments ledger rewrite in Go" onChange={(e) => change({ facts: profile.facts.map((x) => (x.id === f.id ? { ...x, text: e.target.value } : x)) })} />
        <button type="button" aria-label="Remove fact" className="muted grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[var(--bg)]" disabled={busy} onClick={() => change({ facts: profile.facts.filter((x) => x.id !== f.id) })}>✕</button>
      </li>)}</ul>
      <div className="mt-3 flex flex-wrap gap-2">
        {profile.facts.length < 10 && <button type="button" className="btn min-h-10 text-sm" disabled={busy} onClick={() => change({ facts: [...profile.facts, { id: crypto.randomUUID(), text: '', source: 'cv' }] })}>+ Add a fact</button>}
        {importAvailable && <button type="button" className="btn min-h-10 text-sm" disabled={busy} onClick={() => void rewrite()}>{busy ? 'Writing…' : '✨ Write with AI'}</button>}
      </div>
    </div>
    {!!leaks.length && <p role="alert" className="rounded-lg bg-[#fffaeb] p-3 text-sm text-[#93370d]">This mentions {leaks.join(', ')}. Companies see these facts, so remove it before saving.</p>}
  </section>;

  if (!onboarded) {
    const titles = { 1: 'Add your experience', 2: 'Check your profile', 3: 'What matters to you' } as const;
    return <main className="mx-auto max-w-xl px-4 py-8">
      <p className="muted text-sm">Step {step} of 3</p>
      <div className="mt-2 h-1 rounded-full bg-[var(--border)]"><div className="h-1 rounded-full bg-[var(--accent)] transition-all" style={{ width: `${(step / 3) * 100}%` }} /></div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{titles[step]}</h1>
      <div className="mt-6">{banner}</div>
      {step === 1 && experienceStep}
      {step === 2 && <div className="space-y-6">{factsEditor}{profileFields}<div className="flex items-center gap-4"><button className="btn-primary" disabled={busy || !profile.headline.trim()} onClick={() => setStep(3)}>Continue</button><button className="muted text-sm underline" onClick={() => setStep(1)}>Back</button></div></div>}
      {step === 3 && <div className="space-y-6">{preferenceFields}<div className="flex items-center gap-4"><button className="btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Start getting matched'}</button><button className="muted text-sm underline" onClick={() => setStep(2)}>Back</button></div></div>}
    </main>;
  }

  const has = (src: string) => profile.verified.some((v) => v.source === src);
  const accounts = [
    { name: 'Google', status: me.email || 'Signed in', done: true },
    ...(workEmailAvailable ? [{ name: 'Work email', status: has('work-email') ? 'Verified' : 'Shows companies you work in tech', done: has('work-email'), href: '/talent/verify/work-email' }] : []),
    ...(githubAvailable ? [{ name: 'GitHub', status: has('github') ? 'Connected' : 'Adds checked facts from your public work', done: has('github'), href: '/talent/auth/github/start' }] : []),
    ...(linkedinAvailable ? [{ name: 'LinkedIn', status: has('linkedin') ? 'Connected' : 'Confirms you are a real person', done: has('linkedin'), href: '/talent/auth/linkedin/start' }] : []),
  ];
  const visibleRoles = profile.experience.filter((r) => r.title.trim());
  const prefSummary = [
    saved.salary.min ? `${saved.salary.currency} ${saved.salary.min.toLocaleString('en-US')}+` : '',
    saved.workModes.map((m) => WORK_MODES.find((w) => w.mode === m)?.label).join(' · '),
    saved.locations.join(', '),
  ].filter(Boolean);
  const editBtn = (what: typeof editing, label = 'Edit') => <button type="button" className="text-sm font-medium underline underline-offset-4" onClick={() => setEditing(editing === what ? '' : what)}>{editing === what ? 'Close' : label}</button>;
  const sectionHead = (title: string, note: string, action: React.ReactNode) => <div className="flex items-start justify-between gap-3">
    <div><h2 className="font-semibold">{title}</h2><p className="muted text-sm">{note}</p></div>{action}
  </div>;

  return <main className="mx-auto max-w-xl space-y-5 px-4 pb-28 pt-8">
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-[28px] leading-none">Your profile</h1>
      <button type="button" role="switch" aria-checked={!saved.paused} disabled={busy} onClick={() => void toggleOpen()} className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-3 pr-1.5 text-sm font-medium">
        {saved.paused ? 'Paused' : 'Open to talk'}
        <span className={`relative h-6 w-10 rounded-full transition-colors ${saved.paused ? 'bg-[var(--border)]' : 'bg-[#12b76a]'}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${saved.paused ? 'left-0.5' : 'left-[18px]'}`} /></span>
      </button>
    </div>
    {banner}
    {editing === 'facts' ? factsEditor : preview}

    <section aria-label="Experience" className="card space-y-4">
      {sectionHead('Experience', 'Private. Your agent uses it to answer questions.', editBtn('experience'))}
      {editing === 'experience' ? profileFields : editing === 'import' ? experienceStep : <>
        {profile.headline && <p className="font-medium">{profile.headline}</p>}
        {visibleRoles.length
          ? <ul className="space-y-1 text-sm">{visibleRoles.slice(0, 5).map((r) => <li key={r.id} className="flex justify-between gap-3"><span className="truncate">{r.title}</span><span className="muted shrink-0">{[when(r.start), when(r.end) || (r.start ? 'Present' : '')].filter(Boolean).join(' – ')}</span></li>)}</ul>
          : <p className="muted text-sm">No roles yet.</p>}
        {importAvailable && <button type="button" className="btn w-full justify-center text-sm" onClick={() => setEditing('import')}>Update from CV or LinkedIn PDF</button>}
      </>}
    </section>

    <section aria-label="What matters to you" className="card space-y-4">
      {sectionHead('What matters to you', 'Private. Your agent says no for you.', editBtn('prefs'))}
      {editing === 'prefs' ? preferenceFields
        : prefSummary.length || saved.noGos ? <div className="space-y-2">
          {!!prefSummary.length && <div className="flex flex-wrap gap-1.5">{prefSummary.map((p) => <span key={p} className="pill text-sm">{p}</span>)}</div>}
          {saved.noGos && <p className="text-sm"><span className="muted">No-gos:</span> {saved.noGos}</p>}
        </div> : <p className="muted text-sm">Salary, locations and no-gos. Add them so your agent can decide for you.</p>}
    </section>

    <section aria-label="Accounts" className="card space-y-3">
      {sectionHead('Accounts', 'Personal accounts only, never one your employer owns.', null)}
      <ul className="divide-y divide-[var(--border)]">
        {accounts.map((c) => <li key={c.name} className="flex items-center justify-between gap-3 py-3 text-sm">
          <span className="min-w-0"><span className="flex items-center gap-1.5 font-medium">{c.name}{c.done && <span aria-label="connected" className="text-[#12b76a]">✓</span>}</span><span className="muted block truncate">{c.status}</span></span>
          {'href' in c && c.href && !c.done && <a className="btn min-h-9 shrink-0 text-sm" href={c.href}>Connect</a>}
        </li>)}
      </ul>
    </section>

    {dirty && <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
        <span className="muted text-sm">Unsaved changes</span>
        <div className="flex gap-2">
          <button type="button" className="btn min-h-10 text-sm" disabled={busy} onClick={() => { setProfile(saved); setDomains(saved.employerDomains.join(', ')); setLocationsText(saved.locations.join(', ')); setSalaryMin(saved.salary.min !== undefined ? String(saved.salary.min) : ''); setCurrency(saved.salary.currency); setEditing(''); }}>Discard</button>
          <button type="button" className="btn-primary min-h-10" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>}
  </main>;
}

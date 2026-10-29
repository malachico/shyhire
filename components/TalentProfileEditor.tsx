'use client';
import { useState } from 'react';
import type { Experience, ProfileDraft, TalentProfile, WorkMode } from '@/lib/talent';
import { saveTalentProfile } from '@/lib/actions/talent';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS', 'CAD', 'AUD', 'CHF', 'SGD'] as const;
const WORK_MODES: { mode: WorkMode; label: string }[] = [
  { mode: 'remote', label: 'Remote' },
  { mode: 'hybrid', label: 'Hybrid' },
  { mode: 'onsite', label: 'Onsite' },
];

/** Owner-only editor. The anonymous room summary is computed on the server, never from client-supplied prose. */
export function TalentProfileEditor({ initial, error: initialError, githubAvailable = true, linkedinAvailable = true, workEmailAvailable = false, importAvailable = true }: { initial: TalentProfile; error?: string; githubAvailable?: boolean; linkedinAvailable?: boolean; workEmailAvailable?: boolean; importAvailable?: boolean }) {
  const [profile, setProfile] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [domains, setDomains] = useState(initial.employerDomains.join(', '));
  const [locationsText, setLocationsText] = useState((initial.locations ?? []).join(', '));
  const [salaryMinInput, setSalaryMinInput] = useState(initial.salary?.min !== undefined ? String(initial.salary.min) : initial.salaryMin !== undefined ? String(initial.salaryMin) : '');
  const [salaryCurrency, setSalaryCurrency] = useState(initial.salary?.currency || initial.salaryCurrency || 'USD');
  const [source, setSource] = useState('');
  const [file, setFile] = useState<File>();
  const [draft, setDraft] = useState<ProfileDraft>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? '');
  const [notice, setNotice] = useState('');
  const employerDomains = domains.split(',').map((v) => v.trim()).filter(Boolean);
  const locations = locationsText.split(',').map((v) => v.trim()).filter(Boolean);
  const parsedMin = salaryMinInput.trim() ? Number(salaryMinInput.trim()) : undefined;
  const salary = parsedMin !== undefined && Number.isFinite(parsedMin) ? { min: parsedMin, currency: salaryCurrency } : { currency: salaryCurrency };
  const dirty = JSON.stringify({ ...profile, salary, salaryMin: parsedMin, salaryCurrency, locations, employerDomains }) !== JSON.stringify({ ...saved, salary: saved.salary ?? { currency: saved.salaryCurrency || 'USD' } });
  const change = (fields: Partial<TalentProfile>) => { setProfile((p) => ({ ...p, ...fields })); setNotice(''); };
  const role = (id: string, fields: Partial<Experience>) => change({ experience: profile.experience.map((r) => r.id === id ? { ...r, ...fields } : r) });
  const toggleWorkMode = (mode: WorkMode, checked: boolean) => {
    const current = new Set(profile.workModes ?? []);
    if (checked) current.add(mode); else current.delete(mode);
    change({ workModes: WORK_MODES.map((w) => w.mode).filter((m) => current.has(m)) });
  };
  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const { version, headline, about, experience, openTo, workModes, noGos } = profile;
      const result = await saveTalentProfile({ version, headline, about, experience, openTo, salary: { min: salaryMinInput.trim() ? Number(salaryMinInput.trim()) : null, currency: salaryCurrency }, locations, workModes, noGos, employerDomains });
      if (result.error) setError(result.error);
      else if (result.profile) {
        setProfile(result.profile); setSaved(result.profile); setDomains(result.profile.employerDomains.join(', '));
        setLocationsText(result.profile.locations.join(', '));
        setSalaryMinInput(result.profile.salary.min !== undefined ? String(result.profile.salary.min) : '');
        setSalaryCurrency(result.profile.salary.currency);
        setNotice('Profile saved. Your anonymous preview is up to date.');
      }
    } catch { setError('Could not save. Your edits are still here; try again.'); }
    finally { setBusy(false); }
  };
  const extract = async () => {
    setBusy(true); setError('');
    try {
      if (file && (file.type !== 'application/pdf' || file.size > 3 * 1024 * 1024)) throw new Error('Choose a PDF up to 3 MB');
      const pdf = file ? btoa(Array.from(new Uint8Array(await file.arrayBuffer()), (byte) => String.fromCharCode(byte)).join('')) : undefined;
      const response = await fetch('/api/talent/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pdf ? { pdf } : source.trim() ? { text: source } : {}) });
      const result = await response.json() as { draft?: ProfileDraft; error?: string };
      if (result.error) setError(result.error); else if (result.draft) setDraft(result.draft);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not import. Your profile was not changed.'); }
    finally { setBusy(false); }
  };
  const input = 'input w-full text-sm';
  return <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
    <header className="mb-10 border-b border-[var(--border)] pb-7"><p className="mb-2 text-sm text-[var(--muted)]">Parly Talent · Candidate profile</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Let your work introduce you.</h1><p className="mt-3 max-w-2xl text-[var(--muted)]">Build your profile, check the anonymous preview, then tell your representative what a good opportunity looks like.</p></header>
    {error && <p role="alert" className="mb-5 rounded-lg bg-[var(--bad-bg)] p-3 text-sm text-[var(--bad-fg)]">{error}</p>}
    {notice && <p role="status" className="mb-5 text-sm text-[var(--fg)]">{notice}</p>}
    <section aria-label="Connect your professional sources" className="mb-9">
      <h2 className="mb-4 text-xl font-semibold">Connect your sources</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {githubAvailable ? (
          <a href="/talent/auth/github/start" className="rounded-xl border border-[var(--border)] p-5 transition-colors hover:bg-[var(--accent-bg)]"><span className="block text-lg font-semibold">{profile.verified.some((v) => v.source === 'github') ? '✓ GitHub connected' : 'Connect GitHub'}</span><span className="mt-2 block text-sm text-[var(--muted)]">Public activity and technologies</span></a>
        ) : (
          <div aria-disabled="true" className="rounded-xl border border-[var(--border)] p-5"><span className="block text-lg font-semibold">Connect GitHub</span><span className="mt-2 block text-sm text-[var(--muted)]">Not configured yet.</span></div>
        )}
        <a href="#source-title" className="rounded-xl border border-[var(--border)] p-5 transition-colors hover:bg-[var(--accent-bg)]"><span className="block text-lg font-semibold">Upload CV</span><span className="mt-2 block text-sm text-[var(--muted)]">Import experience from a PDF or pasted CV text</span><span className="mt-1 block text-xs text-[var(--muted)]">From LinkedIn: open your profile → More → Save to PDF, then upload it here.</span></a>
        {linkedinAvailable ? (
          <a href="/talent/auth/linkedin/start" className="rounded-xl border border-[var(--border)] p-5 transition-colors hover:bg-[var(--accent-bg)]"><span className="block text-lg font-semibold">{profile.verified.some((v) => v.source === 'linkedin') ? '✓ LinkedIn connected' : 'Connect LinkedIn'}</span><span className="mt-2 block text-sm text-[var(--muted)]">Account connection, not employment verification</span></a>
        ) : (
          <div aria-disabled="true" className="rounded-xl border border-[var(--border)] p-5"><span className="block text-lg font-semibold">Connect LinkedIn</span><span className="mt-2 block text-sm text-[var(--muted)]">Not configured yet.</span></div>
        )}
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">Connections are optional. Save any edits before leaving this page. GitHub activity does not establish employment.</p>
    </section>
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-9">
        <section aria-labelledby="source-title"><h2 id="source-title" className="text-xl font-semibold">Create your professional profile</h2><p className="mt-2 text-sm text-[var(--muted)]">{importAvailable ? 'Optionally paste your CV or LinkedIn experience, or choose your PDF export. Create my profile combines this with connected professional signals. Review and approve the draft before saving.' : 'Generate a starting draft from your connected professional signals, or fill in your profile below. Review and approve the draft before saving.'}</p>
          {importAvailable && <>
            <label className="mt-4 block text-sm">CV or LinkedIn text<textarea className={`${input} mt-1 min-h-32`} aria-label="CV or LinkedIn text" maxLength={40000} disabled={busy || !!file} value={source} onChange={(e) => setSource(e.target.value)} /></label>
            <label className="mt-3 block text-sm">Or your CV / LinkedIn PDF<input className="mt-1 block max-w-full text-sm" type="file" accept="application/pdf" aria-label="LinkedIn PDF" disabled={busy} onChange={(e) => { setFile(e.target.files?.[0]); setDraft(undefined); }} /></label>
            <p className="mt-1 text-xs text-[var(--muted)]">From LinkedIn: open your profile → More → Save to PDF, then upload it here.</p>
            <p className="mt-2 text-xs text-[var(--muted)]">Up to 3 MB. Source text and PDF bytes are used transiently for extraction; Talent does not save the source document.</p>
            {file && <button className="mt-2 text-sm underline" disabled={busy} onClick={() => setFile(undefined)}>Use pasted text instead</button>}
          </>}
          <button className="btn mt-4" disabled={busy} onClick={() => void extract()}>{busy ? 'Working…' : 'Create my profile'}</button>
          {draft && <section aria-label="Imported draft" className="mt-4 rounded-xl border border-[var(--border)] p-4"><h3 className="font-semibold">Review your professional draft</h3><p className="mt-2 break-words">{draft.headline}</p><ul className="mt-3 space-y-2">{draft.experience.map((r) => <li key={r.id} className="text-sm"><strong>{r.title || 'Untitled role'}</strong>{r.company && ` · ${r.company}`}<p className="text-[var(--muted)]">{r.start} {r.end && `– ${r.end}`}</p></li>)}</ul><p className="mt-3 text-sm text-[var(--muted)]">Using this draft replaces the experience in your unsaved editor. Your saved profile stays unchanged until Save.</p><div className="mt-3 flex flex-wrap gap-3"><button className="btn-primary" disabled={busy} onClick={() => { change(draft); setDraft(undefined); }}>Use this draft</button><button className="btn" disabled={busy} onClick={() => setDraft(undefined)}>Discard draft</button></div></section>}
        </section>
        <section aria-labelledby="profile-title"><h2 id="profile-title" className="mb-4 text-xl font-semibold">Review and edit</h2><p className="mb-4 text-sm text-[var(--muted)]">Saving keeps matching facts only: role labels, technologies, dates and verification flags. Names, employers, contact details and links are removed from these fields.</p><fieldset disabled={busy} className="space-y-4">
          <label className="block text-sm">Headline<input aria-label="Headline" className={`${input} mt-1`} maxLength={200} value={profile.headline} onChange={(e) => change({ headline: e.target.value })} /></label>
          <label className="block text-sm">About<textarea aria-label="About" className={`${input} mt-1 min-h-24`} maxLength={6000} value={profile.about} onChange={(e) => change({ about: e.target.value })} /></label>
          {profile.experience.map((r, index) => <section key={r.id} aria-label={`Experience ${index + 1}`} className="rounded-xl border border-[var(--border)] p-4"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-medium">Experience {index + 1}</h3><span className="text-xs text-[var(--muted)]">Self-reported</span></div><div className="grid gap-3 sm:grid-cols-2">{(['title', 'start', 'end'] as const).map((key) => <label key={key} className="text-sm">{{ title: 'Role', company: 'Company', start: 'From', end: 'To / Present' }[key]}<input aria-label={`${key} ${index + 1}`} className={`${input} mt-1`} maxLength={key === 'start' || key === 'end' ? 30 : 200} value={r[key]} onChange={(e) => role(r.id, { [key]: e.target.value })} /></label>)}</div><label className="mt-3 block text-sm">What you did<textarea aria-label={`Description ${index + 1}`} className={`${input} mt-1 min-h-20`} maxLength={4000} value={r.description} onChange={(e) => role(r.id, { description: e.target.value })} /></label><div className="mt-3 flex flex-wrap justify-between gap-3 text-sm"><label><input type="checkbox" checked={r.hidden} onChange={(e) => role(r.id, { hidden: e.target.checked })} /> Hide from matching</label><button className="underline" onClick={() => change({ experience: profile.experience.filter((item) => item.id !== r.id) })}>Remove role</button></div></section>)}
          <button className="btn" disabled={profile.experience.length >= 40} onClick={() => change({ experience: [...profile.experience, { id: crypto.randomUUID(), title: '', company: '', start: '', end: '', description: '', hidden: false, source: 'self' }] })}>Add experience</button>
          <label className="block text-sm">Open to<input aria-label="Open to" className={`${input} mt-1`} maxLength={500} placeholder="Senior backend roles, remote" value={profile.openTo} onChange={(e) => change({ openTo: e.target.value })} /></label>
        </fieldset></section>
        <section aria-labelledby="limits-title">
          <h2 id="limits-title" className="text-xl font-semibold">Private preferences</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Only your representative uses these limits in room screening. Companies don&apos;t receive this text.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px]">
            <label className="block text-sm">
              Minimum salary (annual)
              <input
                aria-label="Minimum salary"
                type="number"
                min={1}
                max={10000000}
                step={1000}
                placeholder="180000"
                className={`${input} mt-1`}
                disabled={busy}
                value={salaryMinInput}
                onChange={(e) => {
                  setSalaryMinInput(e.target.value);
                  setNotice('');
                }}
              />
            </label>
            <label className="block text-sm">
              Currency
              <select
                aria-label="Salary currency"
                className={`${input} mt-1`}
                disabled={busy}
                value={salaryCurrency}
                onChange={(e) => {
                  setSalaryCurrency(e.target.value);
                  setNotice('');
                }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4">
            <label className="block text-sm">
              Locations
              <input
                aria-label="Locations"
                className={`${input} mt-1`}
                disabled={busy}
                placeholder="New York, London, Tel Aviv"
                value={locationsText}
                onChange={(e) => {
                  setLocationsText(e.target.value);
                  setNotice('');
                }}
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              {WORK_MODES.map(({ mode, label }) => (
                <label key={mode} className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    aria-label={label}
                    disabled={busy}
                    checked={(profile.workModes ?? []).includes(mode)}
                    onChange={(e) => toggleWorkMode(mode, e.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="mt-4 block text-sm">
            No-gos
            <textarea
              aria-label="No-gos"
              className={`${input} mt-1 min-h-24`}
              maxLength={1000}
              disabled={busy}
              placeholder="Industries, on-call limits, travel limits, or dealbreakers"
              value={profile.noGos ?? ''}
              onChange={(e) => change({ noGos: e.target.value })}
            />
          </label>
          <label className="mt-4 block text-sm">
            Block employers by domain
            <input
              aria-label="Blocked employer domains"
              className={`${input} mt-1`}
              disabled={busy}
              placeholder="example.com, another.com"
              value={domains}
              onChange={(e) => {
                setDomains(e.target.value);
                setNotice('');
              }}
            />
          </label>
          <p className="mt-1 text-xs text-[var(--muted)]">Verified work domains stay blocked automatically.</p>
        </section>
        <div className="flex flex-wrap items-center gap-4 border-t border-[var(--border)] pt-5"><button className="btn-primary" disabled={busy || (!dirty && profile.version > 0)} onClick={() => void save()}>{busy ? 'Working…' : 'Save profile'}</button>{dirty && <span className="text-sm text-[var(--muted)]">Unsaved changes</span>}</div>
      </div>
      <aside className="min-w-0 space-y-6 lg:sticky lg:top-8"><section aria-label="Anonymous preview" className="rounded-2xl bg-[#15263d] p-6 text-white"><p className="text-sm text-slate-300">What room agents can see</p><h2 className="mt-3 break-all text-xl font-semibold">{saved.alias || 'Your candidate alias'}</h2><p className="mt-4 text-sm leading-relaxed text-slate-100">{saved.publicSummary || 'Save your profile to generate an anonymous summary.'}</p><p className="mt-5 border-t border-white/20 pt-4 text-xs leading-relaxed text-slate-300">Your name, company names, profile links and private preferences are excluded. {dirty && 'Save to refresh this preview.'}</p></section>
        <section aria-label="Verified sources"><h2 className="font-semibold">Verified sources</h2>{profile.verified.length ? <ul className="mt-3 space-y-3">{profile.verified.map((v) => <li key={v.id} className="rounded-lg border border-[var(--border)] p-3"><p className="text-sm font-medium">{v.label}</p>{v.source === 'github' && <p className="mt-1 text-xs text-[var(--muted)]">{String(v.data.publicRepositories ?? 0)} public repositories · {String(v.data.mergedPublicPullRequests ?? 0)} merged public PRs · {String(v.data.restrictedContributionsCount ?? 0)} restricted contributions reported by GitHub in the past year</p>}{v.source === 'linkedin' && (v.data.name || v.data.email) && <p className="mt-1 text-xs text-[var(--muted)]">{[v.data.name, v.data.email].filter(Boolean).join(' · ')}</p>}</li>)}</ul> : <p className="mt-2 text-sm text-[var(--muted)]">Connect GitHub for verified activity. CV / LinkedIn experience remains self-reported.</p>}<a className="mt-4 inline-block text-sm underline" href="/talent/auth/github/start">Connect or refresh GitHub</a>{linkedinAvailable && <a className="mt-3 block text-sm underline" href="/talent/auth/linkedin/start">Connect or refresh LinkedIn</a>}{workEmailAvailable && <a className="mt-3 block text-sm underline" href="/talent/verify/work-email">Verify work email</a>}<p className="mt-1 text-xs text-[var(--muted)]">Save profile edits before leaving this page.</p></section>
      </aside>
    </div>
  </main>;
}




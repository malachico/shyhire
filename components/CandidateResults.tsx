'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Mark } from '@/components/Brand';
import { openTalentRoom } from '@/lib/actions/rooms';
import type { CandidateSearch } from '@/lib/talent';

/** Proof only, before a match: never a domain, username or link. */
const BADGES: Record<string, string> = { github: 'GitHub verified', linkedin: 'LinkedIn connected', 'work-email': 'Work email verified', stripe: 'Stripe verified', vercel: 'Vercel verified' };

export function CandidateResults({ results, query, existing }: { results: CandidateSearch; query: string; existing: Record<string, { id: string; label: string }> }) {
  const router = useRouter();
  const [alias, setAlias] = useState<string>();
  const [role, setRole] = useState(query.slice(0, 200));
  const [comp, setComp] = useState('');
  const [mustHaves, setMustHaves] = useState('');
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function startTalk(e: React.FormEvent) {
    e.preventDefault();
    if (!alias) return;
    setError(undefined);
    start(async () => {
      const res = await openTalentRoom(alias, { role, comp, mustHaves });
      if ('error' in res) return setError(res.error);
      router.push(`/talent/conversations/${encodeURIComponent(res.id)}`);
    });
  }

  if (!results.profiles.length) return <p role="status" className="muted mt-10 text-center text-sm">No matches yet. Try fewer or broader skills.</p>;
  return <>
    <ul aria-label="Candidates" className="mt-6 space-y-3">
      {results.profiles.map((p) => {
        const talking = existing[p.alias];
        return <li key={p.alias} className="card">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-semibold">{p.alias}</h2>
            {talking
              ? <a href={`/talent/conversations/${encodeURIComponent(talking.id)}`} className="pill pill-accent">{talking.label} →</a>
              : <button type="button" className="btn-primary min-h-9 text-sm" onClick={() => { setAlias(p.alias); setError(undefined); }}>Talk</button>}
          </div>
          <p className="mt-2 text-sm leading-relaxed">{p.publicSummary}</p>
          {!!p.badges.length && <ul aria-label="Verified" className="mt-3 flex flex-wrap gap-1.5">{p.badges.map((b) => <li key={b} className="pill">✓ {BADGES[b] ?? 'Verified'}</li>)}</ul>}
          {p.openTo && <p className="muted mt-3 text-sm">Open to: {p.openTo}</p>}
        </li>;
      })}
    </ul>
    {results.capped && <p className="muted mt-4 text-center text-xs">Showing the best 20 matches.</p>}
    {alias && <div role="dialog" aria-modal="true" aria-labelledby="talk-title" className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 sm:items-center" onClick={(e) => e.target === e.currentTarget && !pending && setAlias(undefined)}>
      <form onSubmit={startTalk} className="max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-2xl bg-[var(--surface)] p-5 sm:rounded-2xl">
        <div className="flex items-center gap-3">
          <Mark size={44} />
          <div>
            <h2 id="talk-title" className="text-lg font-semibold">Talk to {alias}</h2>
            <p className="muted text-sm">Only your agent sees this. The candidate sees your company name.</p>
          </div>
        </div>
        <label className="field">Role<input className="input" value={role} onChange={(e) => setRole(e.target.value)} maxLength={200} required placeholder="Senior backend engineer" /></label>
        <label className="field">Salary band<input className="input" value={comp} onChange={(e) => setComp(e.target.value)} maxLength={200} placeholder="$180k–$220k" /></label>
        <label className="field">Must-haves<textarea className="input min-h-20" value={mustHaves} onChange={(e) => setMustHaves(e.target.value)} maxLength={2000} placeholder="5+ years Go, remote in EU" /></label>
        {error && <p role="alert" className="text-sm text-[var(--bad-fg)]">{error}</p>}
        <div className="flex items-center justify-end gap-3">
          <button type="button" className="btn" disabled={pending} onClick={() => setAlias(undefined)}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Starting…' : 'Start'}</button>
        </div>
      </form>
    </div>}
  </>;
}

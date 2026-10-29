'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { openTalentRoom } from '@/lib/actions/rooms';
import type { CandidateSearch } from '@/lib/talent';

const badges = { github: 'GitHub activity', linkedin: 'LinkedIn account', 'work-email': 'Work email', stripe: 'Stripe', vercel: 'Vercel' };

export function CandidateResults({ results, query }: { results: CandidateSearch; query: string }) {
  const router = useRouter();
  const [openAlias, setOpenAlias] = useState<string>();
  const [role, setRole] = useState(query.slice(0, 200));
  const [comp, setComp] = useState('');
  const [mustHaves, setMustHaves] = useState('');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function selectCandidate(alias: string) {
    setError(undefined);
    if (openAlias === alias) {
      setOpenAlias(undefined);
      return;
    }
    setOpenAlias(alias);
    if (!role.trim() && query.trim()) setRole(query.trim().slice(0, 200));
  }

  function handleSubmit(e: React.FormEvent, alias: string) {
    e.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const res = await openTalentRoom(alias, { role, comp, mustHaves });
      if ('error' in res) return setError(res.error);
      router.push(`/talent/rooms/${encodeURIComponent(res.id)}`);
    });
  }

  return <section className="mt-8" aria-label="Candidate results">
    {results.capped && <p className="mt-2 text-xs text-[var(--muted)]">Search covers the first 200 approved profiles and shows up to 20 matches.</p>}
    {!query.trim() ? <p className="mt-8 text-sm text-[var(--muted)]">Enter a role or technology to start.</p> : !results.profiles.length ? <p role="status" className="mt-8 text-sm text-[var(--muted)]">No matching candidates yet. Try a role such as backend engineer or a technology such as Python.</p> : <div className="mt-5 grid gap-4 md:grid-cols-2">
      {results.profiles.map((profile) => {
        const isOpen = openAlias === profile.alias;
        return <article key={profile.alias} className="flex min-w-0 flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{profile.alias}</h2>
              <button type="button" className={isOpen ? 'btn text-xs' : 'btn-primary text-xs'} onClick={() => selectCandidate(profile.alias)}>
                {isOpen ? 'Cancel' : 'Open a room'}
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed">{profile.publicSummary}</p>
            {!!profile.badges.length && <ul aria-label="Verified sources" className="mt-4 flex flex-wrap gap-2">{profile.badges.map((badge) => <li key={badge} className="rounded-full bg-[var(--accent-bg)] px-2 py-1 text-xs">✓ {badges[badge]}</li>)}</ul>}
            {profile.openTo && <p className="mt-4 text-sm"><span className="font-medium">Open to:</span> {profile.openTo}</p>}
          </div>
          {isOpen && (
            <form onSubmit={(e) => handleSubmit(e, profile.alias)} className="mt-5 space-y-3 border-t border-[var(--border)] pt-4">
              <p className="text-xs text-[var(--muted)]">Private brief for your hiring agent (the candidate only sees your company domain and shared messages):</p>
              <label className="block text-xs font-medium">
                Role title
                <input className="input mt-1 w-full text-sm" value={role} onChange={(e) => setRole(e.target.value)} maxLength={200} required placeholder="Senior Backend Engineer" />
              </label>
              <label className="block text-xs font-medium">
                Compensation band
                <input className="input mt-1 w-full text-sm" value={comp} onChange={(e) => setComp(e.target.value)} maxLength={200} placeholder="$180k–$220k + equity" />
              </label>
              <label className="block text-xs font-medium">
                Must-haves & private criteria
                <textarea className="input mt-1 min-h-20 w-full text-sm" value={mustHaves} onChange={(e) => setMustHaves(e.target.value)} maxLength={2000} placeholder="5+ years Python/Postgres, remote US/EU" />
              </label>
              {error && <p role="alert" className="text-xs text-[var(--bad-fg)]">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="submit" disabled={pending} className="btn-primary text-xs">
                  {pending ? 'Opening room…' : 'Start agent conversation'}
                </button>
              </div>
            </form>
          )}
        </article>;
      })}
    </div>}
  </section>;
}

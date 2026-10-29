'use client';
import type { CandidateSearch } from '@/lib/talent';

const badges = { github: 'GitHub activity', linkedin: 'LinkedIn account', 'work-email': 'Work email', stripe: 'Stripe', vercel: 'Vercel' };

export function CandidateResults({ results, query }: { results: CandidateSearch; query: string }) {
  return <section className="mt-8" aria-label="Candidate results">
    {results.capped && <p className="mt-2 text-xs text-[var(--muted)]">Search covers the first 200 approved profiles and shows up to 20 matches.</p>}
    {!query.trim() ? <p className="mt-8 text-sm text-[var(--muted)]">Enter a role or technology to start.</p> : !results.profiles.length ? <p role="status" className="mt-8 text-sm text-[var(--muted)]">No matching candidates yet. Try a role such as backend engineer or a technology such as Python.</p> : <div className="mt-5 grid gap-4 md:grid-cols-2">
      {results.profiles.map((profile) => <article key={profile.alias} className="flex min-w-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-lg font-semibold">{profile.alias}</h2>
        <p className="mt-3 text-sm leading-relaxed">{profile.publicSummary}</p>
        {!!profile.badges.length && <ul aria-label="Verified sources" className="mt-4 flex flex-wrap gap-2">{profile.badges.map((badge) => <li key={badge} className="rounded-full bg-[var(--accent-bg)] px-2 py-1 text-xs">✓ {badges[badge]}</li>)}</ul>}
        {profile.openTo && <p className="mt-4 text-sm"><span className="font-medium">Open to:</span> {profile.openTo}</p>}
      </article>)}
    </div>}
  </section>;
}

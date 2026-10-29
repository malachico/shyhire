import { redirect } from 'next/navigation';
import { TalentRoomDecisionForm } from '@/components/TalentRoomDecisionForm';
import { statusBadgeLabel } from '@/components/TalentRoomDetailView';
import { currentSession } from '@/lib/auth';
import { TalentError } from '@/lib/profiles';
import { roomViews, type CandidateRequestSummary } from '@/lib/roomViews';

export const dynamic = 'force-dynamic';

export default async function CandidateRequestsPage() {
  const session = await currentSession();
  if (!session) redirect('/talent/profile');
  let requests: CandidateRequestSummary[] = [];
  let error: string | undefined;
  try {
    requests = await roomViews().listCandidateRequests(session.sub);
  } catch (e) {
    if (!(e instanceof TalentError)) throw e;
    error = e.message;
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Company requests</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Companies are named from the start while you stay anonymous until both sides approve the fit summary. Your agent handles the initial conversation and only asks when a decision or final approval is needed.
          </p>
        </div>
        <a href="/talent/profile" className="btn text-sm">Your profile</a>
      </div>

      {error && <p role="alert" className="mt-6 text-sm text-[var(--bad-fg)]">{error}</p>}

      {!error && !requests.length ? (
        <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="text-sm text-[var(--muted)]">No companies have opened a room with your profile yet.</p>
        </div>
      ) : (
        <ul aria-label="Candidate requests" className="mt-8 space-y-4">
          {requests.map((req) => {
            const statusInfo = statusBadgeLabel(req.status, 'candidate', req.waitingOn);
            const badgeCls = statusInfo.highlight
              ? 'bg-[var(--accent-bg)] text-[var(--accent)]'
              : 'border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)]';
            return (
              <li key={req.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <a href={`/talent/requests/${encodeURIComponent(req.id)}`} className="text-lg font-semibold hover:underline">
                        {req.companyName}
                      </a>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeCls}`}>{statusInfo.label}</span>
                      {req.documentVersion !== undefined && (
                        <span className="text-xs text-[var(--muted)]">Summary v{req.documentVersion}</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">Anonymous as {req.candidateAlias}</p>
                  </div>
                  <a href={`/talent/requests/${encodeURIComponent(req.id)}`} className="btn text-sm">
                    View room
                  </a>
                </div>
                {req.needsDecision && (
                  <TalentRoomDecisionForm
                    roomId={req.id}
                    question={req.needsDecision.question}
                    options={req.needsDecision.options}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

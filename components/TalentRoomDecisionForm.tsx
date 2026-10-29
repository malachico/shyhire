'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { decideTalentRoom } from '@/lib/actions/rooms';

export function TalentRoomDecisionForm({
  roomId,
  question,
  options,
}: {
  roomId: string;
  question: string;
  options: string[];
}) {
  const router = useRouter();
  const [customChoice, setCustomChoice] = useState('');
  const [error, setError] = useState<string>();
  const [answered, setAnswered] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submitChoice(choice: string) {
    const trimmed = choice.trim();
    if (!trimmed) {
      setError('Choose an option or enter a response');
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const res = await decideTalentRoom(roomId, trimmed);
      if ('error' in res && res.error) {
        setError(res.error);
        return;
      }
      setAnswered(trimmed);
      setCustomChoice('');
      router.refresh();
    });
  }

  if (answered) {
    return (
      <div role="status" className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--accent-bg)] p-4 text-sm">
        <p className="font-medium">Decision sent to your agent: <span className="font-normal">{answered}</span></p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-[var(--accent)] bg-[var(--accent-bg)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">Your agent needs your decision</p>
      <p className="mt-1.5 text-sm font-medium">{question}</p>
      {!!options.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={pending}
              onClick={() => submitChoice(option)}
              className="btn text-sm font-medium hover:border-[var(--accent)]"
            >
              {option}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitChoice(customChoice);
        }}
        className="mt-3 flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="text"
          value={customChoice}
          onChange={(e) => setCustomChoice(e.target.value)}
          disabled={pending}
          maxLength={2000}
          placeholder={options.length ? 'Or type another answer…' : 'Type your answer…'}
          aria-label="Your answer"
          className="input flex-1 text-sm"
        />
        <button type="submit" disabled={pending || !customChoice.trim()} className="btn-primary text-sm">
          {pending ? 'Sending…' : 'Send decision'}
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-[var(--bad-fg)]">{error}</p>}
    </div>
  );
}

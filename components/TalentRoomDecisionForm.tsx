'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { decideTalentRoom } from '@/lib/actions/rooms';

/** The agent's question: one tap on an option, or "Other…" with a short answer. */
export function TalentRoomDecisionForm({ roomId, question, options }: { roomId: string; question: string; options: string[] }) {
  const router = useRouter();
  const [other, setOther] = useState(!options.length);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [answered, setAnswered] = useState<string>();
  const [pending, start] = useTransition();

  function send(choice: string) {
    const c = choice.trim();
    if (!c) return setError('Choose an option or write an answer');
    setError(undefined);
    start(async () => {
      const res = await decideTalentRoom(roomId, c);
      if ('error' in res && res.error) return setError(res.error);
      setAnswered(c);
      router.refresh();
    });
  }

  if (answered) return <p role="status" className="mt-2 text-sm">Sent to your agent: <span className="font-medium">{answered}</span></p>;
  return <div className="mt-2">
    <p className="font-medium">{question}</p>
    {!!options.length && <div className="mt-3 flex flex-wrap gap-2">
      {options.map((o) => <button key={o} type="button" disabled={pending} onClick={() => send(o)} className="btn text-sm hover:border-[var(--accent)]">{o}</button>)}
      {!other && <button type="button" disabled={pending} onClick={() => setOther(true)} className="btn text-sm">Other…</button>}
    </div>}
    {other && <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input className="input flex-1 text-sm" aria-label="Your answer" maxLength={2000} disabled={pending} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer" />
      <button type="submit" className="btn-primary text-sm" disabled={pending || !text.trim()}>{pending ? 'Sending…' : 'Send'}</button>
    </form>}
    {error && <p role="alert" className="mt-2 text-sm text-[var(--bad-fg)]">{error}</p>}
  </div>;
}

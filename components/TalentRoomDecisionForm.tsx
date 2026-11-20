'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { decideTalentRoom } from '@/lib/actions/rooms';
import { ConfirmPrompt } from './Confirm';
import { Markdown } from './Markdown';

/** The agent's question: pick an option, or "Other…" with a short answer, then confirm before it goes to your agent. */
export function TalentRoomDecisionForm({ roomId, question, options }: { roomId: string; question: string; options: string[] }) {
  const router = useRouter();
  const [other, setOther] = useState(!options.length);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [answered, setAnswered] = useState<string>();
  const [chosen, setChosen] = useState<string>();
  const [pending, start] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);

  function choose(choice: string) {
    const c = choice.trim();
    if (!c) return setError('Choose an option or write an answer');
    setError(undefined);
    setChosen(c);
  }

  /** Cancel keeps the choices on screen and puts focus back on the one picked. */
  function cancel() {
    const back = [...(wrap.current?.querySelectorAll<HTMLElement>('[data-choice]') ?? [])].find((b) => b.dataset.choice === chosen);
    setChosen(undefined);
    (back ?? wrap.current?.querySelector<HTMLElement>('input'))?.focus();
  }

  function send(c: string) {
    setChosen(undefined);
    start(async () => {
      const res = await decideTalentRoom(roomId, c);
      if ('error' in res && res.error) return setError(res.error);
      setAnswered(c);
      router.refresh();
    });
  }

  if (answered) return <p role="status" className="mt-2 text-sm">Sent to your agent: <span className="font-medium">{answered}</span></p>;
  return <div ref={wrap} className="mt-2">
    <div className="font-medium"><Markdown text={question} /></div>
    {!!options.length && <div className="mt-3 flex flex-wrap gap-2">
      {options.map((o) => <button key={o} type="button" data-choice={o} aria-pressed={chosen === o} disabled={pending} onClick={() => choose(o)} className="btn text-sm hover:border-[var(--accent)]">{o}</button>)}
      {!other && <button type="button" disabled={pending} onClick={() => setOther(true)} className="btn text-sm">Other…</button>}
    </div>}
    {other && <form onSubmit={(e) => { e.preventDefault(); choose(text); }} className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input className="input flex-1 text-sm" aria-label="Your answer" maxLength={2000} disabled={pending} value={text} onChange={(e) => { setText(e.target.value); setChosen(undefined); }} placeholder="Your answer" />
      <button type="submit" className="btn-primary text-sm" disabled={pending || !text.trim()}>{pending ? 'Sending…' : 'Send'}</button>
    </form>}
    {chosen && <div className="mt-3"><ConfirmPrompt key={chosen} message={<>Send &ldquo;{chosen}&rdquo; to your agent?</>} confirmLabel="Yes, send" confirmClassName="btn-primary text-sm" onConfirm={() => send(chosen)} onCancel={cancel} /></div>}
    {error && <p role="alert" className="mt-2 text-sm text-[var(--bad-fg)]">{error}</p>}
  </div>;
}

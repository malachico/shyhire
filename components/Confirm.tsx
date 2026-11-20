'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

type PromptProps = { message: ReactNode; confirmLabel: string; confirmClassName?: string; onConfirm: () => void; onCancel: () => void };

/** The inline "are you sure?" step: the message, a confirm button that takes focus, and Cancel. Escape cancels. */
export function ConfirmPrompt({ message, confirmLabel, confirmClassName = 'btn text-sm', onConfirm, onCancel }: PromptProps) {
  const ok = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => { ok.current?.focus(); }, []);
  return <div role="group" aria-labelledby={id} className="flex flex-wrap items-center gap-3" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}>
    <p id={id} className="text-sm font-medium">{message}</p>
    <button ref={ok} type="button" className={confirmClassName} aria-describedby={id} onClick={onConfirm}>{confirmLabel}</button>
    <button type="button" className="muted text-sm underline" onClick={onCancel}>Cancel</button>
  </div>;
}

/** A button that asks first: the first tap swaps it for a ConfirmPrompt; Cancel or Escape puts it back and refocuses it. */
export function ConfirmButton({ children, className, disabled, title, ariaLabel, ...prompt }: Omit<PromptProps, 'onCancel'> & { children: ReactNode; className?: string; disabled?: boolean; title?: string; ariaLabel?: string }) {
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => { if (!asking && refocus.current) { refocus.current = false; trigger.current?.focus(); } }, [asking]);
  if (asking) return <ConfirmPrompt {...prompt} onConfirm={() => { refocus.current = true; setAsking(false); prompt.onConfirm(); }} onCancel={() => { refocus.current = true; setAsking(false); }} />;
  return <button ref={trigger} type="button" className={className} disabled={disabled} title={title} aria-label={ariaLabel} onClick={() => setAsking(true)}>{children}</button>;
}

'use client';
import { useEffect, useRef } from 'react';

/** The account `<details>` menu, closing on Escape (focus back to the summary) and on a click outside. */
export function AccountMenu({ children, ...props }: React.ComponentProps<'details'>) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (e.key !== 'Escape' || !el?.open) return;
      el.open = false;
      el.querySelector('summary')?.focus();
    };
    const onClick = (e: MouseEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
  }, []);
  return <details ref={ref} {...props}>{children}</details>;
}

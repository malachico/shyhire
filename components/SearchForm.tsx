'use client';
import { useTransition, type ComponentProps } from 'react';
import { useRouter } from 'next/navigation';

export const Spinner = () => <span aria-hidden className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />;

/** The candidate search box. Still a plain GET form without JS; with it, the button spins until the results arrive. */
export function SearchForm({ formClass, button, buttonClass, ...input }: Omit<ComponentProps<'input'>, 'name' | 'required' | 'maxLength'> & { formClass: string; button: string; buttonClass: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <form action="/talent/search" className={formClass} onSubmit={(e) => {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get('q') ?? '');
    start(() => router.push(`/talent/search?${new URLSearchParams({ q })}`));
  }}>
    <input {...input} name="q" maxLength={1000} required />
    <button className={buttonClass} type="submit" disabled={pending}>{pending && <Spinner />}{button}</button>
  </form>;
}

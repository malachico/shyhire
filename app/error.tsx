'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Mark } from '@/components/Brand';

// `retry` (not `reset`) re-fetches the segment, so it can recover from a failed server render.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 py-7 text-center">
    <Mark size={120} flower={false} look="up" />
    <div className="space-y-2">
      <h1 className="text-[30px] leading-[1.05]">Something went wrong</h1>
      <p className="muted text-base">That didn&apos;t load. Try again in a moment.</p>
    </div>
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => retry()} className="rounded-[14px] bg-[var(--ink)] px-5 py-3 font-semibold text-[var(--bg)] hover:bg-[#2b2b2b]">Try again</button>
      <Link href="/" className="underline">Go home</Link>
    </div>
  </main>;
}

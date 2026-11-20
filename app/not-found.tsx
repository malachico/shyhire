import Link from 'next/link';
import { Mark } from '@/components/Brand';

export default function NotFound() {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 py-7 text-center">
    <Mark size={120} flower={false} look="ahead" />
    <div className="space-y-2">
      <h1 className="text-[30px] leading-[1.05]">Page not found</h1>
      <p className="muted text-base">We couldn&apos;t find that page.</p>
    </div>
    <Link href="/" className="rounded-[14px] bg-[var(--ink)] px-5 py-3 font-semibold text-[var(--bg)] hover:bg-[#2b2b2b]">Go home</Link>
  </main>;
}

import { AppIcon, Wordmark } from '@/components/Brand';

export const COMPANY = 'MALACHI, a company registered in Israel';
export const CONTACT = 'malachi@madgic.ai';
export const UPDATED = '30 October 2026';

/** The shell for the privacy and terms pages: a plain readable column. */
export function Legal({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="mx-auto max-w-2xl space-y-5 px-6 py-7 text-[15px] leading-relaxed [&_h2]:pt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
    <a href="/" className="flex items-center gap-2"><AppIcon /><Wordmark /></a>
    <h1 className="text-[32px] leading-tight">{title}</h1>
    <p className="muted text-sm">Last updated {UPDATED}</p>
    {children}
    <p className="muted pt-4 text-sm"><a href="/privacy" className="underline">Privacy</a> · <a href="/terms" className="underline">Terms</a></p>
  </main>;
}

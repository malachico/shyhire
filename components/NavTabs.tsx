'use client';
import { usePathname } from 'next/navigation';

/** The two tabs for the current mode; the active one is underlined. */
export function NavTabs({ tabs, dot }: { tabs: { href: string; label: string }[]; dot?: string }) {
  const path = usePathname();
  return <div className="flex items-center gap-5 text-sm">
    {tabs.map((t) => {
      const active = path === t.href || path.startsWith(`${t.href}/`);
      return <a key={t.href} href={t.href} aria-current={active ? 'page' : undefined} className={`relative py-1 ${active ? 'font-semibold' : 'muted hover:text-[var(--fg)]'}`}>
        {t.label}
        {dot === t.href && <span aria-label="needs you" className="absolute -right-2.5 top-0.5 size-2 rounded-full bg-[var(--accent)]" />}
        {active && <span className="absolute -bottom-[17px] left-0 right-0 h-0.5 bg-[var(--fg)]" />}
      </a>;
    })}
  </div>;
}

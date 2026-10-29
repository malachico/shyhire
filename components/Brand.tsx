/** Shyhire's mark: the shy one, holding out a flower (and its app icon and wordmark). */

const FLOWER = [[13, 61.5], [18.3, 65.4], [16.3, 71.6], [9.7, 71.6], [7.7, 65.4]] as const;

/** The creature. `flower` holds it out; `look` moves the pupils: 'flower' (left), 'up', or 'ahead'. */
export function Mark({ size = 120, flower = true, look = 'flower', label, body = 'var(--ink)' }: { size?: number; flower?: boolean; look?: 'flower' | 'up' | 'ahead'; label?: string; body?: string }) {
  const [dx, dy] = look === 'flower' ? [-3.5, -2] : look === 'up' ? [1.5, -5] : [0, 0];
  return <svg width={size} height={size} viewBox="0 0 120 120" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <path d="M30 116 V60 C30 30 48 12 68 12 C88 12 106 30 106 60 V116 Z" fill={body} />
    <circle cx="56" cy="62" r="12.5" fill="#fff" /><circle cx="84" cy="62" r="12.5" fill="#fff" />
    <circle cx={56 + dx} cy={62 + dy} r="6.2" fill="var(--ink)" /><circle cx={84 + dx} cy={62 + dy} r="6.2" fill="var(--ink)" />
    {flower && <>
      <path d="M31 92 Q22 90 17 82" fill="none" stroke="var(--ink)" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M17 82 L13 72" fill="none" stroke="#3F7D3A" strokeWidth="2" strokeLinecap="round" />
      {FLOWER.map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4.3" fill="var(--sun)" />)}
      <circle cx="13" cy="67" r="2.8" fill="#E0761A" />
    </>}
  </svg>;
}

/** The eyes on a black rounded square: nav, favicon, small places. */
export function AppIcon({ size = 28 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
    <rect width="120" height="120" rx="28" fill="var(--ink)" />
    <circle cx="44" cy="62" r="17" fill="#fff" /><circle cx="76" cy="62" r="17" fill="#fff" />
    <circle cx="39.5" cy="59" r="8.5" fill="var(--ink)" /><circle cx="71.5" cy="59" r="8.5" fill="var(--ink)" />
  </svg>;
}

export function Wordmark({ className = 'text-[22px]' }: { className?: string }) {
  return <span className={`display font-extrabold tracking-[-0.035em] ${className}`}>shyhire</span>;
}

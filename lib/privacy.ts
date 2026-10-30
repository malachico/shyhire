const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The text with employers (names or domains), links and email addresses blanked: what an agent may be told about someone. */
export function redact(text: string, employers: string[]): string {
  let out = text.replace(/https?:\/\/\S+|www\.\S+/gi, '[link]').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]');
  for (const raw of employers) {
    const e = raw.trim();
    if (e.length < 2) continue;
    const word = /\./.test(e) ? e.split('.')[0]! : '';
    for (const term of [e, ...(word.length >= 4 ? [word] : [])]) out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(term)}(?![\\p{L}\\p{N}])`, 'giu'), '[employer]');
  }
  return out;
}

/** What in the candidate's own text could identify them: their name, email, a link, or a blocked employer. */
export function privacyLeaks(text: string, me: { name: string; email: string }, blocked: string[]): string[] {
  const t = text.toLowerCase();
  const out: string[] = [];
  const nameParts = me.name.toLowerCase().split(/\s+/).filter((p) => p.length > 2);
  if (nameParts.some((p) => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t))) out.push('your name');
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t) || (me.email && t.includes(me.email.toLowerCase()))) out.push('an email address');
  if (/https?:\/\/|www\.|linkedin\.com\/in\//.test(t)) out.push('a link');
  const hit = blocked.find((d) => { const dom = d.toLowerCase(), word = dom.split('.')[0]!; return !!dom && (t.includes(dom) || (word.length >= 4 && new RegExp(`\\b${word}\\b`).test(t))); });
  if (hit) out.push(hit);
  return out;
}

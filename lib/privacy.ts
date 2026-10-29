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

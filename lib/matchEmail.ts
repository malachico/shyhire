import type { TalentRevealedContact } from './roomViews.ts';

export interface MatchEmailInput {
  /** The other side, only ever what the room already reveals after agreement. */
  other: TalentRevealedContact;
  role: string;
  summary?: string;
  url: string;
}

const FONT = `'Bricolage Grotesque',Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Agents write the summary, so it is escaped first; only headings, bold and bullets are kept. */
// ponytail: regex, not a Markdown renderer. Tables and links stay as plain text; add a renderer if summaries use them.
const summaryHtml = (summary: string) => esc(summary)
  .replace(/^#{1,6}\s+(.+)$/gm, '<strong>$1</strong>')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/^\s*[-*]\s+/gm, '• ');

const circle = (label: string, bg: string, fg: string) =>
  `<td width="56" height="56" align="center" valign="middle" style="width:56px;height:56px;border-radius:28px;background:${bg};color:${fg};font:800 22px ${FONT};">${esc(label)}</td>`;

const heading = (label: string) =>
  `<p style="margin:0 0 8px;font:700 12px ${FONT};letter-spacing:.08em;text-transform:uppercase;color:#6B6560;">${label}</p>`;

function contactRows(other: TalentRevealedContact): string {
  const rows = [
    other.email && `<a href="mailto:${esc(other.email)}" style="color:#22305A;">${esc(other.email)}</a>`,
    other.githubUrl && `<a href="${esc(other.githubUrl)}" style="color:#22305A;">github.com/${esc(other.githubLogin ?? '')}</a>`,
  ].filter(Boolean);
  return rows.map((r) => `<p style="margin:4px 0 0;font:15px/22px ${FONT};">${r}</p>`).join('');
}

/** The email one side receives when a conversation matches. Every dynamic value is escaped. */
export function matchEmail({ other, role, summary, url }: MatchEmailInput): { subject: string; text: string; html: string } {
  const name = other.displayName;
  const subject = `It's a match: ${name}`;
  const initial = name.replace(/^@/, '').charAt(0).toUpperCase() || '?';
  const reach = [other.email, other.githubUrl].filter(Boolean) as string[];

  const text = [
    `You matched with ${name}.`,
    role && `Role: ${role}`,
    'You both approved the summary, so the conversation is open.',
    summary && `What you agreed:\n${summary}`,
    reach.length ? `Reach them:\n${reach.join('\n')}` : '',
    `Open the conversation: ${url}`,
  ].filter(Boolean).join('\n\n');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#FBF8F3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF8F3;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #E6DFD3;border-radius:16px;overflow:hidden;">
<tr><td align="center" style="background:#22305A;padding:32px 28px 36px;">
<p style="margin:0 0 24px;font:800 18px ${FONT};letter-spacing:-.03em;color:#F5B700;">Shyhire</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
${circle('You', '#FBF8F3', '#22305A').replace('font:800 22px', 'font:800 14px')}
<td width="44" align="center" style="width:44px;color:#F5B700;font:800 20px ${FONT};">&mdash;</td>
${circle(initial, '#F5B700', '#141414')}
</tr></table>
<p style="margin:24px 0 8px;font:700 12px ${FONT};letter-spacing:.1em;text-transform:uppercase;color:#F5B700;">It's a match</p>
<h1 dir="auto" style="margin:0;font:800 28px/34px ${FONT};letter-spacing:-.03em;color:#fff;">You matched with ${esc(name)}</h1>
${role ? `<p dir="auto" style="margin:10px 0 0;font:16px/24px ${FONT};color:#E6DFD3;">${esc(role)}</p>` : ''}
</td></tr>
<tr><td style="padding:28px;">
<p style="margin:0;font:16px/24px ${FONT};color:#141414;">You both approved the summary, so the conversation is open.</p>
${summary ? `<div style="height:24px;"></div>${heading('What you agreed')}
<div dir="auto" style="padding:16px 18px;background:#FFF1C2;border-radius:12px;font:15px/23px ${FONT};color:#141414;white-space:pre-wrap;">${summaryHtml(summary)}</div>` : ''}
${reach.length ? `<div style="height:24px;"></div>${heading('Reach them')}
<p dir="auto" style="margin:0;font:600 15px/22px ${FONT};color:#141414;">${esc(name)}</p>${contactRows(other)}` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td style="background:#F5B700;border-radius:10px;">
<a href="${esc(url)}" style="display:inline-block;padding:13px 24px;font:700 15px ${FONT};color:#141414;text-decoration:none;">Open the conversation</a>
</td></tr></table>
</td></tr>
</table>
<p style="margin:16px 0 0;font:12px/18px ${FONT};color:#6B6560;">You're getting this because a conversation of yours on Shyhire matched.</p>
</td></tr></table>
</body></html>`;

  return { subject, text, html };
}

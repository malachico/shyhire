import { createElement } from 'react';
import ReactMarkdown from 'react-markdown';

// Links and images stay out on purpose: agent text comes from the other side, and a pixel or a click would give them the viewer's IP.
const ALLOWED = ['p', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'br', 'hr'];

/** Agent text as Markdown. A `.ts` file so `npm test` can import it. */
// ponytail: no GFM, so tables stay plain text; add remark-gfm when agents start writing them.
export function Markdown({ text }: { text: string }) {
  return createElement('div', { className: 'md' }, createElement(ReactMarkdown, { allowedElements: ALLOWED, unwrapDisallowed: true }, text));
}

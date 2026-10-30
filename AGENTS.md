# Working on Shyhire

- Tests need the Firestore emulator: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npm test`. Also `npm run typecheck` and `npm run build`.
- Candidate privacy comes first: nothing a company sees (facts, cards, agent briefs, room text) may carry a name, employer, link, email or pay number. See `lib/privacy.ts`.
- A room's side always comes from the stored room, never from the browser.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

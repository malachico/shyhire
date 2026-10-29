# Parly Talent

A hiring app built on Parly. Candidates and companies sign in here (GitHub); Parly is only the
platform underneath: Talent's server opens rooms over Parly's Apps API, where two hosted agents
check the fit for their sides. Parly never learns who the people are: it sees an opaque side
`ref` and a brief, nothing else.

## How it talks to Parly

- `lib/parly.ts`: server-only client for `/v1` with the app's API key (`Authorization: Bearer pk_live_…`):
  agent templates, opening rooms, room status, each side's messages, decisions, approvals, closing.
  The browser never calls Parly.
- `app/api/parly/webhook/route.ts`: Parly's room events (`room.needs_decision`, `room.document_updated`,
  `room.agreed`, `room.stuck`, `room.closed`). `lib/webhooks.ts` checks the `Parly-Signature` header
  (HMAC-SHA256 over `"<t>.<raw body>"`, refused after 5 minutes). For now the route only logs.

## Sign-in

GitHub (the "Parly Talent" GitHub App), OAuth with state and PKCE; the GitHub token is used once and
never stored. The session is a signed, HttpOnly, host-only cookie holding the GitHub id and login.
Callback: `<APP_URL>/talent/auth/github/callback` (registered on the GitHub app as
`https://talent.parly.dev/talent/auth/github/callback`).

## Environment

See `.env.example`: `APP_URL`, `SESSION_SECRET` (32+ chars), `TALENT_GITHUB_CLIENT_ID`,
`TALENT_GITHUB_CLIENT_SECRET`, `PARLY_API_URL`, `PARLY_API_KEY`, `PARLY_WEBHOOK_SECRET`.

## Develop

```
npm install
npm run dev        # http://localhost:3100
npm test           # session, webhook, profile, work-email, connection and search checks
npm run build
```

## Database & Profiles

- `lib/db.ts`: Firestore in Talent's own GCP project (`parly-talent-0a7c87`). On Vercel production it authenticates via Vercel OIDC + GCP Workload Identity Federation (`@vercel/oidc` + `ExternalAccountClient`); locally and in tests it uses `FIRESTORE_EMULATOR_HOST`.
- `lib/profiles.ts`: candidate profiles, professional-only normalization (`professionalDraft`, `publicSummary`), transient CV/PDF draft extraction, and anonymous candidate search (`search`).
- `lib/roomViews.ts`: company rooms (`/talent/rooms`, `/talent/rooms/[id]`) and candidate requests (`/talent/requests`, `/talent/requests/[id]`), deriving the viewer's side (`company` or `candidate`) server-side from `talent_rooms/{parlyRoomId}` before loading live room messages/documents or calling `parly.decide` and `parly.approve`.
- `lib/github.ts`, `lib/workEmail.ts`, `lib/linkedin.ts`: GitHub public activity extraction, private one-time code work-email verification, and LinkedIn account connection via Composio.


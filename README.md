<p align="center"><img src="docs/shyhire.svg" width="160" alt="The Shyhire creature holding out a flower"></p>

<h1 align="center">Shyhire</h1>

<p align="center"><b>Let your work introduce you.</b><br>Anonymous hiring where AI agents check the fit first.</p>

<p align="center"><a href="https://shyhire.com">shyhire.com</a> · <a href="https://shyhire.com/privacy">Privacy</a> · <a href="LICENSE">MIT license</a></p>

Each candidate and each company is represented by an AI agent; the agents talk first in a shared room and check the fit. People only step in to answer a question or say
yes, and names are shared only after both sides say yes.

Shyhire is built on [Parly](https://parly.dev) and is a working example of its Apps API (`/v1`): agents, agent
search and rooms. Parly never learns who the people are: it sees an anonymous alias, opaque side refs and briefs.

## How it works

- **Candidates** sign in with Google, import a CV (PDF or text) or write a profile, and choose which facts
  companies see. They can connect GitHub, LinkedIn and a work email for verified facts. Their minimum pay,
  no-gos and blocked companies stay private to their own agent.
- **Companies** sign in with Google, verify a work email, and open a role. The role's agent searches candidates'
  agents, opens a conversation with each strong fit, and keeps a few more going each day.
- **In a room**, the two agents talk, ask their side when they need a decision, and write a shared summary.
  When both sides approve it, each sees the other's contact details.

## Privacy

- The CV file or pasted text is sent once to Gemini to draft the profile and never stored.
- What companies see is checked for the person's name, email, links and employers before it is saved
  (`lib/privacy.ts`, `Profiles.save`).
- The candidate's agent is never told employer names, links or email addresses: they are blanked out of its
  brief (`redact`, `candidateBrief`). It knows the minimum pay but is instructed never to state it.
- Companies on a candidate's employer or blocked domains never find them or reach them.
- GitHub and LinkedIn access tokens are used once and not kept.

See [shyhire.com/privacy](https://shyhire.com/privacy) for what is stored.

## Code map

- `lib/parly.ts`: server-only client for Parly's `/v1` API with the app key. The browser never calls Parly.
- `lib/profiles.ts`: profiles, CV import and AI-written facts (Vertex AI, metered per person), candidate search.
- `lib/roomViews.ts`: opening rooms, each candidate's own agent (`syncCandidate`), conversation lists and room
  views (the viewer's side always comes from the stored room, never the client), decisions, approvals, reveal.
- `lib/roles.ts` and `app/api/cron/roles`: standing roles; a daily Vercel Cron opens new conversations.
- `app/api/parly/webhook`: Parly's signed room events (`lib/webhooks.ts` checks `Parly-Signature`), stored
  idempotently.
- `lib/google.ts`, `lib/github.ts`, `lib/linkedin.ts`, `lib/workEmail.ts`: Google sign-in (OpenID Connect ID
  token, no client secret), GitHub and LinkedIn connections, and work-email codes.
- `lib/session.ts`, `lib/auth.ts`: a signed, HttpOnly, host-only session cookie holding the Google `sub`.
- `lib/db.ts`: Firestore. In production it authenticates with Vercel OIDC and GCP Workload Identity Federation;
  locally and in tests it uses the emulator.

## Run it

```
cp .env.example .env.local   # fill in what you need; see the comments there
npm install
gcloud emulators firestore start --host-port=127.0.0.1:8085 &
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npm run dev    # http://localhost:3100
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npm test
npm run typecheck && npm run build
```

Sign-in needs a Google OAuth client with `<APP_URL>/talent/auth/google/callback` as a redirect URI. Rooms and
agents need a Parly app key (`PARLY_API_KEY`) and its webhook secret.

## License

MIT, see [LICENSE](LICENSE). The Shyhire name and logo are not covered by the license.

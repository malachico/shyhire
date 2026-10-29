import type { Firestore } from '@google-cloud/firestore';
import { db, DEFAULT_GCP_PROJECT_ID, gcpAccessToken } from './db.ts';
import { firestoreLlmMeter, Profiles, vertexProfileImporter, vertexSummaryWriter } from './profiles.ts';
import { parly } from './parly.ts';
import { Roles } from './roles.ts';
import { roomViews } from './roomViews.ts';
import { noticeMailer, WorkEmailVerification } from './workEmail.ts';

export type { CandidateCard, CandidateSearch, Experience, Fact, ProfileDraft, SalaryPreference, TalentProfile, Verification, WorkMode } from './types.ts';

let cachedProfiles: Profiles | undefined;

export function profileImportConfigured(): boolean {
  return Boolean(
    (process.env.GCP_PROJECT_NUMBER && process.env.GCP_SERVICE_ACCOUNT_EMAIL) ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );
}

export function createProfiles(
  store: Firestore = db(),
  importerOpts?: Partial<Parameters<typeof vertexProfileImporter>[0]>,
): Profiles {
  const instance = new Profiles(store);
  if (importerOpts || profileImportConfigured()) {
    const opts = {
      project: importerOpts?.project ?? process.env.VERTEX_PROJECT ?? process.env.GCP_PROJECT_ID ?? DEFAULT_GCP_PROJECT_ID,
      location: importerOpts?.location ?? process.env.VERTEX_LOCATION ?? 'global',
      model: importerOpts?.model ?? process.env.VERTEX_MODEL ?? 'gemini-2.5-flash',
      prices: importerOpts?.prices ?? {
        input: Number(process.env.LLM_PRICE_INPUT_PER_MTOK || 0.3),
        output: Number(process.env.LLM_PRICE_OUTPUT_PER_MTOK || 2.5),
      },
      meter: importerOpts?.meter ?? firestoreLlmMeter(store),
      accessToken: importerOpts?.accessToken ?? gcpAccessToken,
      ...(importerOpts?.fetchImpl ? { fetchImpl: importerOpts.fetchImpl } : {}),
    };
    instance.importer = vertexProfileImporter(opts);
    instance.summarizer = vertexSummaryWriter(opts);
  }
  return instance;
}

let cachedRoles: Roles | undefined;
export function roles(): Roles {
  return (cachedRoles ??= new Roles(profiles(), roomViews()));
}

export function profiles(): Profiles {
  if (!cachedProfiles && process.env.PARLY_API_KEY) {
    cachedProfiles = createProfiles();
    cachedProfiles.onChange = async (p) => { await roomViews().syncCandidate(p); };
    cachedProfiles.agentSearch = async (query, limit) => (await parly.searchAgents(query, { limit })).results;
  }
  return (cachedProfiles ??= createProfiles());
}

export function workEmailConfigured(): boolean {
  return Boolean((process.env.SMTP_USER ?? process.env.GMAIL_USER) && (process.env.SMTP_APP_PASSWORD ?? process.env.GMAIL_APP_PASSWORD));
}

export function workEmail(): WorkEmailVerification {
  return new WorkEmailVerification(
    db(),
    profiles(),
    noticeMailer(process.env.SMTP_USER ?? process.env.GMAIL_USER, process.env.SMTP_APP_PASSWORD ?? process.env.GMAIL_APP_PASSWORD),
  );
}



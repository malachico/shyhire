import { createHash } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import { db, DEFAULT_GCP_PROJECT_ID, gcpAccessToken } from './db.ts';
import { appUrl } from './github.ts';
import { Composio, TalentLinkedIn } from './linkedin.ts';
import { firestoreLlmMeter, Profiles, vertexProfileImporter } from './profiles.ts';
import { noticeMailer, WorkEmailVerification } from './workEmail.ts';

export type { CandidateCard, CandidateSearch, Experience, ProfileDraft, SalaryPreference, TalentProfile, Verification, WorkMode } from './types.ts';

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
    instance.importer = vertexProfileImporter({
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
    });
  }
  return instance;
}

export function profiles(): Profiles {
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

export function talentLinkedIn(): TalentLinkedIn | undefined {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const authConfigId = process.env.TALENT_LINKEDIN_AUTH_CONFIG_ID;
  const secret = process.env.SESSION_SECRET;
  if (!apiKey || !authConfigId || !secret || !process.env.APP_URL) return undefined;
  return new TalentLinkedIn(
    db(),
    profiles(),
    new Composio(apiKey),
    createHash('sha256').update(secret).digest(),
    authConfigId,
    appUrl(),
  );
}


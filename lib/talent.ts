import { createHash } from 'node:crypto';
import { db } from './db.ts';
import { appUrl } from './github.ts';
import { Composio, TalentLinkedIn } from './linkedin.ts';
import { Profiles } from './profiles.ts';
import { noticeMailer, WorkEmailVerification } from './workEmail.ts';

export type { CandidateCard, CandidateSearch, Experience, ProfileDraft, TalentProfile, Verification } from './types.ts';

let cachedProfiles: Profiles | undefined;

export function profiles(): Profiles {
  return (cachedProfiles ??= new Profiles(db()));
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

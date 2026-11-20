import type { Experience, Fact, ProfileDraft } from './types.ts';

const filled = (s: string | undefined) => !!s?.trim();

/** "Write with AI" replaces the CV facts: worth a confirm only when one has text. */
export const factsToLose = (facts: Fact[]) => facts.some((f) => filled(f.text));

/** Removing a role loses something only if any field was filled in. */
export const roleHasContent = (r: Experience) => [r.title, r.company, r.start, r.end, r.description].some(filled);

/** A CV import overwrites the headline, about, roles and facts. */
export const draftToLose = (p: Pick<ProfileDraft, 'headline' | 'about' | 'experience'> & { facts: Fact[] }) =>
  filled(p.headline) || filled(p.about) || p.experience.some(roleHasContent) || factsToLose(p.facts);

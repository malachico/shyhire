type Provider = 'github' | 'linkedin';
const LABEL: Record<Provider, string> = { github: 'GitHub', linkedin: 'LinkedIn' };

const MESSAGES: Record<string, string> = {};
for (const p of ['github', 'linkedin'] as const) {
  const l = LABEL[p];
  MESSAGES[`${p}_not_configured`] = `${l} connection is not configured.`;
  MESSAGES[`${p}_failed`] = `${l} connection failed. Please try again.`;
  MESSAGES[`${p}_unavailable`] = `${l} could not verify your account. Please try again.`;
  MESSAGES[`${p}_conflict`] = `This ${l} account is already connected to another profile.`;
}

const GENERIC = 'Something went wrong. Please try again.';

/** The code a connect callback puts in /talent/profile?error=, from a TalentError's code. Never the error's own text. */
export function connectErrorCode(provider: Provider, talentCode?: string): string {
  return talentCode === 'conflict' || talentCode === 'unavailable' ? `${provider}_${talentCode}` : `${provider}_failed`;
}

/** /talent/profile's ?error= is a code; never render the raw value, a link could carry any text. */
export function profileErrorMessage(code: unknown): string | undefined {
  if (code === undefined || code === '') return undefined;
  return typeof code === 'string' && Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : GENERIC;
}

const MESSAGES: Record<string, string> = {
  cancelled: 'Google sign-in was cancelled. Please try again.',
  failed: 'Google sign-in failed. Please try again.',
};

/** The landing page's ?error= is a code; never render the raw value, a link could carry any text. */
export function signInErrorMessage(code: unknown): string | undefined {
  if (code === undefined || code === '') return undefined;
  return typeof code === 'string' && Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : 'Something went wrong signing you in. Please try again.';
}

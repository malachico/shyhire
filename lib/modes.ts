/** Whether the person is here to find work or to hire: it picks the tabs and where sign-in lands. */
export type Mode = 'work' | 'hire';

/** Only these two values; anything else is "work" (never a redirect target taken from input). */
export const parseMode = (v: unknown): Mode => (v === 'hire' ? 'hire' : 'work');

/** Where each mode starts after sign-in or a switch. */
export const homeOf = (mode: Mode) => (mode === 'hire' ? '/talent/search' : '/talent/profile');

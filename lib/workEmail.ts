import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import nodemailer from 'nodemailer';
import { callerOf, TalentError, type Profiles } from './profiles.ts';
import type { TalentCaller } from './types.ts';

export const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'ymail.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.de',
  'gmx.net', 'mail.com', 'yandex.com', 'yandex.ru', 'fastmail.com', 'hey.com', 'zoho.com', 'tutanota.com',
  'tuta.io', 'qq.com', '163.com', '126.com',
]);

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

export function normalizeDomain(raw: string): string {
  const domain = raw.trim().toLowerCase().replace(/^@/, '');
  if (!domain || domain.length > 253 || !DOMAIN_RE.test(domain)) throw new TalentError('invalid', `"${raw}" is not a valid domain (like acme.com)`);
  if (FREE_MAIL_DOMAINS.has(domain)) throw new TalentError('invalid', `${domain} is a public mail provider; anyone could join.`);
  return domain;
}

export type NoticeMailer = (to: string[], subject: string, text: string) => Promise<void>;

export function noticeMailer(user: string | undefined, appPassword: string | undefined): NoticeMailer | undefined {
  if (!user || !appPassword) return undefined;
  const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass: appPassword } });
  return async (to, subject, text) => {
    if (to.length) await transport.sendMail({ from: `Parly Talent <${user}>`, to, subject, text });
  };
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
interface Window { windowAt: number; count: number; sentAt: number }
interface Challenge extends Window { email: string; domain: string; salt: string; codeHash: string; expiresAt: number; attempts: number; consumed: boolean }

/** Mailbox control only: this never changes login identity or grants workspace access. */
export class WorkEmailVerification {
  private readonly db: Firestore;
  private readonly profiles: Profiles;
  private readonly mailer?: NoticeMailer;
  constructor(db: Firestore, profiles: Profiles, mailer?: NoticeMailer) {
    this.db = db;
    this.profiles = profiles;
    this.mailer = mailer;
  }
  async request(caller: TalentCaller, raw: unknown): Promise<{ sent: true }> {
    const { id } = callerOf(caller, 'Sign in as a person to verify work email');
    if (!this.mailer) throw new TalentError('unsupported', 'Work email delivery is not configured');
    if (typeof raw !== 'string' || raw.length > 254) throw new TalentError('invalid', 'Enter a work email address');
    const email = raw.trim().toLowerCase();
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(email) || email.split('@')[0]!.length > 64) {
      throw new TalentError('invalid', 'Enter a work email address');
    }
    let domain: string;
    try { domain = normalizeDomain(domainOf(email)); }
    catch { throw new TalentError('invalid', 'Use your work email address, not a personal one (Gmail, Outlook…).'); }
    const now = Date.now(), code = String(randomInt(1_000_000)).padStart(6, '0'), salt = randomBytes(32).toString('hex');
    const ref = this.db.collection('talent_email_challenges').doc(id);
    const limit = this.db.collection('talent_email_limits').doc(hash(email));
    await this.db.runTransaction(async (tx) => {
      const [person, target] = await tx.getAll(ref, limit);
      const next = (previous?: Window): Window => {
        if (previous && now - previous.sentAt < 60_000) throw new TalentError('rate_limited', 'Wait one minute before requesting another code');
        const current = previous && now - previous.windowAt < 3_600_000 ? previous : { windowAt: now, count: 0, sentAt: 0 };
        if (current.count >= 5) throw new TalentError('rate_limited', 'Too many codes requested. Try again in an hour.');
        return { windowAt: current.windowAt, count: current.count + 1, sentAt: now };
      };
      const personWindow = next(person!.data() as Window | undefined), targetWindow = next(target!.data() as Window | undefined);
      tx.set(ref, { ...personWindow, email, domain, salt, codeHash: hash(`${salt}:${code}`), expiresAt: now + 600_000, attempts: 0, consumed: false } satisfies Challenge);
      tx.set(limit, targetWindow);
    });
    try { await this.mailer([email], 'Your Parly Talent verification code', `Your code is ${code}. It expires in 10 minutes. If you did not request this code, ignore this message.`); }
    catch { throw new TalentError('unavailable', 'Could not send the verification code. Wait one minute and try again.'); }
    return { sent: true };
  }
  async confirm(caller: TalentCaller, raw: unknown): Promise<{ verified: true }> {
    const { id } = callerOf(caller, 'Sign in as a person to verify work email');
    if (typeof raw !== 'string' || !/^\d{6}$/.test(raw)) throw new TalentError('invalid', 'Enter the six-digit code');
    const ref = this.db.collection('talent_email_challenges').doc(id);
    const verified = await this.db.runTransaction(async (tx) => {
      const challenge = (await tx.get(ref)).data() as Challenge | undefined;
      if (!challenge || challenge.consumed || challenge.expiresAt <= Date.now() || challenge.attempts >= 5) return false;
      if (!timingSafeEqual(Buffer.from(challenge.codeHash, 'hex'), Buffer.from(hash(`${challenge.salt}:${raw}`), 'hex'))) {
        tx.update(ref, { attempts: challenge.attempts + 1 });
        return false;
      }
      await this.profiles.verify(id, { id: `work-email:${challenge.domain}`, source: 'work-email', label: 'Work email verified', verifiedAt: new Date().toISOString(), data: { domain: challenge.domain } }, tx);
      tx.update(ref, { consumed: true });
      return true;
    });
    if (!verified) throw new TalentError('invalid', 'Code is incorrect, expired or already used. Request a new code.');
    return { verified: true };
  }
}


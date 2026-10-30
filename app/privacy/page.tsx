import type { Metadata } from 'next';
import { COMPANY, CONTACT, Legal } from '@/components/Legal';

export const metadata: Metadata = { title: 'Privacy · Shyhire' };

export default function Privacy() {
  return <Legal title="Privacy policy">
    <p>Shyhire (shyhire.com) is run by {COMPANY} (&quot;we&quot;). This page says what we keep about you, why, and who else sees it. Questions or requests: <a href={`mailto:${CONTACT}`} className="underline">{CONTACT}</a>.</p>

    <h2>What we keep</h2>
    <ul>
      <li><b>Your sign-in:</b> your Google account id, email and name, to keep you signed in.</li>
      <li><b>Your profile:</b> what you save on it: headline, about, roles, the facts companies see, what you&apos;re open to, your private preferences and minimum pay, and companies you block.</li>
      <li><b>Accounts you connect:</b> from GitHub, your username and public activity counts and languages; from LinkedIn, your name and email; for a work email, the address and its domain.</li>
      <li><b>Companies:</b> the company name, the roles you post and your private brief for each.</li>
      <li><b>Conversations:</b> what the agents say in a room, the shared summary, and the decisions you make.</li>
      <li><b>Usage:</b> how much AI each account has used, to apply limits.</li>
    </ul>

    <h2>What we don&apos;t keep</h2>
    <ul>
      <li><b>Your CV.</b> A CV you upload or paste is sent once to an AI model to draft your profile, then thrown away. Only the profile you choose to save is kept.</li>
      <li><b>Access to your accounts.</b> We read GitHub and LinkedIn once when you connect them and don&apos;t keep the access tokens, so we can&apos;t act on those accounts.</li>
    </ul>

    <h2>Who sees what</h2>
    <ul>
      <li>Companies see an anonymous profile: an alias, the facts you choose to show, and which accounts are verified. Never your name, employers, links or pay numbers.</li>
      <li>Your name and contact details are shared with the other side only after both of you say yes.</li>
      <li>We don&apos;t sell your data or use it for advertising.</li>
    </ul>

    <h2>Services we use</h2>
    <p>We store data on Google Cloud (Firestore), host the site on Vercel, run the agents and rooms on Parly, and use AI models (including Google Gemini on Vertex AI) to draft profiles, rank matches and run the agents. They process data for us to provide Shyhire, and may do so outside Israel.</p>

    <h2>Cookies</h2>
    <p>We use only the cookies needed to keep you signed in and remember whether you&apos;re looking for work or hiring. No ad or tracking cookies.</p>

    <h2>Keeping and deleting</h2>
    <p>We keep your data while your account is open. You can pause matching on your profile at any time. To see, fix or delete your data, email <a href={`mailto:${CONTACT}`} className="underline">{CONTACT}</a> and we&apos;ll do it within 30 days, except where the law requires us to keep something.</p>

    <h2>Changes</h2>
    <p>If we change this policy we&apos;ll update this page and its date. Using Shyhire after a change means you accept it.</p>
  </Legal>;
}

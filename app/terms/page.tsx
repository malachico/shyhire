import type { Metadata } from 'next';
import { COMPANY, CONTACT, Legal } from '@/components/Legal';

export const metadata: Metadata = { title: 'Terms · Shyhire' };

export default function Terms() {
  return <Legal title="Terms of use">
    <p>These terms are an agreement between you and {COMPANY} (&quot;we&quot;), which runs Shyhire (shyhire.com). By using Shyhire you accept them. If you don&apos;t, don&apos;t use it.</p>

    <h2>What Shyhire is</h2>
    <p>Shyhire lets AI agents talk for candidates and companies to check whether a role fits, before either side shares who they are. We are not an employer, recruiter or employment agency, and we are not a party to any job, offer or agreement between you and anyone you meet here.</p>

    <h2>Your part</h2>
    <ul>
      <li>You&apos;re at least 18 and allowed to use Shyhire where you live.</li>
      <li>What you put on Shyhire is true, yours to share, and lawful. You&apos;re responsible for it.</li>
      <li>Don&apos;t misuse Shyhire: no fake profiles or roles, no trying to identify people who haven&apos;t agreed to share, no scraping, spam, attacks, or getting around limits.</li>
      <li>Keep your account secure. You&apos;re responsible for what happens on it.</li>
    </ul>

    <h2>AI agents</h2>
    <p>Agents and AI-written text can be wrong, incomplete or misleading. Nothing an agent says binds you or anyone else. Check everything yourself before you rely on it or decide anything.</p>

    <h2>No warranty</h2>
    <p>Shyhire is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind. We don&apos;t promise it will be available, accurate or error-free, that you&apos;ll find a match, or anything about the people and companies you meet. We don&apos;t check users or roles and aren&apos;t responsible for what they say or do.</p>

    <h2>Limitation of liability</h2>
    <p>To the fullest extent the law allows, we (and our owners, employees and suppliers) are not liable for any loss or damage of any kind arising from Shyhire or its use, including lost income, opportunities, data or reputation, hiring decisions, and anything another user does, whether direct, indirect, incidental or consequential, and even if we were told it could happen. Where the law doesn&apos;t allow that, our total liability is limited to the amount you paid us in the 12 months before the claim, or USD 100 if you paid nothing.</p>

    <h2>Your responsibility to us</h2>
    <p>You will cover our costs and losses, including reasonable legal fees, from any claim arising from your content, your use of Shyhire, or your breaking these terms or the law.</p>

    <h2>Ending</h2>
    <p>You can stop using Shyhire at any time. We may suspend or close any account, or change or stop Shyhire, at any time and for any reason.</p>

    <h2>Changes</h2>
    <p>We may change these terms by updating this page. Using Shyhire after a change means you accept it.</p>

    <h2>Law</h2>
    <p>These terms are governed by the laws of the State of Israel. The courts of Tel Aviv-Jaffa have exclusive jurisdiction over any dispute. Contact: <a href={`mailto:${CONTACT}`} className="underline">{CONTACT}</a>.</p>
  </Legal>;
}

import { redirect } from 'next/navigation';
import { currentMode, homeOf } from '@/lib/mode';

/** Old address: nav links each mode's home directly; this keeps old /talent links landing in the right place. */
export default async function Talent() { redirect(homeOf(await currentMode())); }

import { redirect } from 'next/navigation';

export default async function Old({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/talent/conversations/${encodeURIComponent((await params).id)}`);
}

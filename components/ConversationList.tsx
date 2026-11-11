'use client';
import { useState } from 'react';
import { filterSort, pillClass, type Bucket, type Filter, type Sort, type Tone } from '@/lib/status';

export type ListRow = { id: string; title: string; sub: string; label: string; tone: Tone; bucket: Bucket; updatedAt: string };

/** The conversations list with a state filter and sort, all client-side over rows the server already rendered. */
export function ConversationList({ rows }: { rows: ListRow[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('updated');
  const shown = filterSort(rows, filter, sort);
  return <>
    <div className="mt-6 flex flex-wrap gap-2 text-sm">
      <select className="input min-w-0 flex-1" aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
        <option value="all">All</option>
        <option value="needs_me">Needs me</option>
        <option value="talking">Talking</option>
        <option value="agreed">Agreed</option>
        <option value="ended">Closed or stuck</option>
      </select>
      <select className="input min-w-0 flex-1" aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
        <option value="updated">Last updated</option>
        <option value="needs_me">Needs me first</option>
      </select>
    </div>
    {!shown.length && <p className="muted mt-4 text-sm">No conversations match.</p>}
    {!!shown.length && <ul className="mt-4 divide-y divide-[var(--border)] overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface)]">
      {shown.map((r) => <li key={r.id}><a href={`/talent/conversations/${encodeURIComponent(r.id)}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-[var(--bg)]">
        <span className="min-w-0">
          <span className="block truncate font-medium">{r.title}</span>
          <span className="muted block truncate text-sm">{r.sub}</span>
        </span>
        <span className={`${pillClass(r.tone)} max-w-[50%] text-right whitespace-normal!`}>{r.label}</span>
      </a></li>)}
    </ul>}
  </>;
}

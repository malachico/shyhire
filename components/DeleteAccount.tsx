'use client';

import { useRef, useState } from 'react';

export function DeleteAccount() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  return <>
    <button type="button" onClick={() => dialog.current?.showModal()} className="w-full rounded-lg px-2 py-2 text-left text-red-600 hover:bg-[var(--bg)]">Delete account</button>
    <dialog ref={dialog} aria-labelledby="delete-account-title" className="card m-auto max-w-sm p-5 text-sm backdrop:bg-black/40" onClose={() => setTyped('')}>
      <form action="/talent/account/delete" method="post" className="space-y-3">
        <h2 id="delete-account-title" className="text-base font-semibold">Delete your account?</h2>
        <p className="muted">This removes your profile, contact details, verified accounts and roles. Open conversations close, and companies keep only your anonymous alias. This can&apos;t be undone.</p>
        <label className="block space-y-1">
          <span>Type DELETE to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => dialog.current?.close()} className="rounded-lg px-3 py-1.5 hover:bg-[var(--bg)]">Cancel</button>
          <button disabled={typed !== 'DELETE'} className="rounded-lg bg-red-600 px-3 py-1.5 text-white disabled:opacity-40">Delete account</button>
        </div>
      </form>
    </dialog>
  </>;
}

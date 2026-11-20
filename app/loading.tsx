export default function Loading() {
  return <main className="flex min-h-dvh items-center justify-center px-6">
    <div role="status" className="muted flex items-center gap-3 text-base">
      <span aria-hidden className="size-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
      Loading…
    </div>
  </main>;
}

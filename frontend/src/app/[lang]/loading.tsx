export default function Loading() {
  return (
    <div className="mx-auto grid max-w-6xl place-items-center px-4 py-24" role="status" aria-live="polite">
      <svg viewBox="0 0 40 40" className="size-12 animate-spin motion-reduce:animate-none" aria-hidden="true">
        <circle cx="20" cy="20" r="16" fill="none" className="stroke-brand-cool-steel" strokeWidth={3} />
        <circle cx="20" cy="20" r="16" fill="none" pathLength={100} strokeDasharray="30 100" strokeLinecap="round" className="stroke-brand-baltic-blue" strokeWidth={3} />
      </svg>
      <span className="sr-only">…</span>
    </div>
  )
}

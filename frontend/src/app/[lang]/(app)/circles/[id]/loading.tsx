const block = "animate-pulse rounded-[32px] bg-brand-mist motion-reduce:animate-none"

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12" role="status" aria-live="polite" aria-busy="true">
      <div className="h-5 w-24 animate-pulse rounded-full bg-brand-mist motion-reduce:animate-none" />
      <div className={`${block} mt-4 h-64`} />
      <div className={`${block} mt-8 h-96`} />
      <span className="sr-only">…</span>
    </div>
  )
}

const block = "animate-pulse rounded-[32px] bg-brand-mist motion-reduce:animate-none"

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12" role="status" aria-live="polite" aria-busy="true">
      <div className="h-6 w-52 animate-pulse rounded-full bg-brand-mist motion-reduce:animate-none" />
      <div className="mt-3 h-10 w-56 animate-pulse rounded-2xl bg-brand-mist motion-reduce:animate-none" />
      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${block} h-72`} />
        ))}
      </div>
      <span className="sr-only">…</span>
    </div>
  )
}

const block = "animate-pulse rounded-[32px] bg-brand-mist motion-reduce:animate-none"

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12" role="status" aria-live="polite" aria-busy="true">
      <div className="h-6 w-28 animate-pulse rounded-full bg-brand-mist motion-reduce:animate-none" />
      <div className="mt-3 h-10 w-48 animate-pulse rounded-2xl bg-brand-mist motion-reduce:animate-none" />
      <div className="mt-2 h-5 w-80 max-w-full animate-pulse rounded-xl bg-brand-mist motion-reduce:animate-none" />
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className={`${block} h-64 lg:col-span-5`} />
        <div className={`${block} h-80 lg:col-span-7`} />
      </div>
      <span className="sr-only">…</span>
    </div>
  )
}

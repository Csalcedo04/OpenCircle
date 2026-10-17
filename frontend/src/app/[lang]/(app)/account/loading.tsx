// Skeleton in the dashboard's shape, so the page doesn't jump when the data arrives.
const block = "animate-pulse rounded-[28px] bg-brand-mist motion-reduce:animate-none"

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12" role="status" aria-live="polite" aria-busy="true">
      <div className="h-6 w-56 animate-pulse rounded-full bg-brand-mist motion-reduce:animate-none" />
      <div className="mt-4 h-10 w-64 animate-pulse rounded-2xl bg-brand-mist motion-reduce:animate-none" />
      <div className="mt-6 h-12 animate-pulse rounded-2xl bg-brand-mist motion-reduce:animate-none" />
      <div className="mt-8 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-32 rounded-3xl`} />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className={`${block} h-72 lg:col-span-7`} />
        <div className={`${block} h-72 lg:col-span-5`} />
        <div className={`${block} h-80 lg:col-span-7`} />
        <div className={`${block} h-80 lg:col-span-5`} />
      </div>
      <div className={`${block} mt-6 h-64`} />
      <span className="sr-only">…</span>
    </div>
  )
}

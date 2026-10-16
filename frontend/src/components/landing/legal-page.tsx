import { ArrowUpRight } from "lucide-react"
import type { LegalDictionary } from "@/i18n/dictionaries/legal.es"
import { REPO_URL } from "@/lib/site"

type Doc = LegalDictionary["privacy"]

export function LegalPage({ doc, updated, contact }: { doc: Doc; updated: string; contact: string }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <h1 className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{doc.title}</h1>
      <p className="mt-3 text-sm text-brand-slate">{updated}</p>
      <div className="mt-12 space-y-10">
        {doc.sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-xl font-semibold tracking-[-0.01em]">{s.h}</h2>
            <p className="mt-3 leading-relaxed text-brand-navy/85">{s.p}</p>
          </section>
        ))}
      </div>
      <p className="mt-12 border-t border-brand-line pt-8 leading-relaxed text-brand-navy/85">
        {contact}{" "}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-brand-violet-ink underline-offset-4 hover:underline"
        >
          github.com/Csalcedo04/OpenCircle
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </a>
      </p>
    </article>
  )
}

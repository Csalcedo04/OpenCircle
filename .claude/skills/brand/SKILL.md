---
name: brand
description: Brand rules for every user-visible change in this repository — colours, typography, the logo, Tailwind v4 tokens, contrast and bilingual copy. Use it whenever the user asks for UI, layout, styling, colours, fonts, logos, icons, a new page, section or component, the 404 page, a "re-skin", "look and feel", "diseño", "colores" or "estilos", even without the word "brand". Usar en cualquier cambio visual de `frontend/`. NO usar para lógica de pagos, backend, base de datos ni textos legales; do not use for payment flows (use the Open Payments skills).
---

# Brand for OpenCircle

The brand is a premium, approachable consumer-fintech look: deep navy text, a violet accent, soft mint highlights on an off-white canvas, Geist throughout, generous whitespace and 20–28px radii. Colours, typefaces and the logo are brand decisions, not styling preferences: never invent a hex value, never substitute a font, never draw a logo.

This file is the whole brand contract for this repo; `CLAUDE.md` only points here.

## Palette

| Role              | Name            | Hex       | Tailwind token       |
| ----------------- | --------------- | --------- | -------------------- |
| Primary / text    | Deep navy       | `#101828` | `brand-navy`         |
| Brand accent      | Violet          | `#7659F5` | `brand-violet`       |
| Secondary accent  | Soft mint       | `#BDF8DA` | `brand-mint`         |
| Background        | Warm off-white  | `#F8FAFC` | `brand-canvas`       |
| Surface           | White           | `#FFFFFF` | `brand-white`        |
| Secondary surface | Mist            | `#F1F3F9` | `brand-mist`         |
| Muted text        | Slate           | `#667085` | `brand-slate`        |

Derived tokens (mixes of the palette, no new hues):

| Token              | Definition                       | Use                                   |
| ------------------ | -------------------------------- | ------------------------------------- |
| `brand-violet-ink` | violet 85% + navy                | Violet **text** on canvas/white       |
| `brand-on-navy`    | white 72% + navy                 | Muted text on navy panels             |
| `brand-line`       | navy 10% + white                 | Borders and dividers                  |

There are no status reds, greens or yellows. Show state with the palette plus an icon and a text label, never with colour alone.

## Typography

- **Geist**, the only family: headlines, body, buttons, numbers. Hierarchy comes from size, weight (400–600) and tight negative tracking on large type (`tracking-[-0.03em]` to `-0.04em`), not from a second family.
- Loaded once with `next/font/google` in `frontend/src/app/[lang]/layout.tsx` as `--font-geist`, exposed as Tailwind `font-sans` and `font-heading`.
- Money uses `tabular-nums` and is always formatted with `Intl.NumberFormat` (`es-CO` / `en-US`), never by hand.

## Logo

- The OpenCircle wordmark is the **Interledger mark standing in for the "O"**, followed by "penCircle". It lives in `frontend/src/components/logo-mark.tsx` (`LogoMark` for the mark, `Logo` for the wordmark).
- The mark is drawn with `stroke="currentColor"`, so it takes the text colour of its container: navy on light surfaces, white on navy. That is the only sanctioned recolour. Never edit the paths or redraw the mark. The favicon `frontend/src/app/icon.svg` is generated from the same paths.

## Where the tokens live

- **`frontend/src/app/globals.css` is the only place a colour or font is defined.** The `@theme` block holds the `brand-*` colours (each with its name in a comment) and the derived tokens. The `:root` block maps shadcn's semantic tokens (`background`, `primary`, `muted-foreground`, `border`, …) onto them. Components use `bg-brand-violet`, `text-brand-slate`, `border-brand-line`, `text-muted-foreground`, never `bg-[#...]` or `style={{ color: ... }}`.
- Gradients and glows use `color-mix()` of brand variables inside arbitrary values, e.g. `bg-[radial-gradient(...,color-mix(in_srgb,var(--color-brand-violet)_18%,transparent),...)]`. Never a hex.
- If you need a role token that's missing, add it in `globals.css`, once, as a mix of brand variables, with a comment.
- **A brand change must be one edit.** If changing the violet would touch more than its line in `@theme`, the palette has leaked; fix the leak while you're there.
- **Surfaces that can't read Tailwind** may inline brand hex values, each annotated with its brand name: the Open Graph image (`opengraph-image.tsx`, rendered by Satori), `icon.svg`, and `viewport.themeColor` in the root layout.

## Contrast

Every text/background pair must clear WCAG AA (4.5:1 normal text, 3:1 large text and UI parts). Measured:

| Text on background               | Ratio  | Use                                        |
| -------------------------------- | ------ | ------------------------------------------ |
| Navy on canvas                   | 17.0:1 | Body and headings                          |
| Slate on white                   | 5.0:1  | Muted text                                 |
| Slate on canvas                  | 4.75:1 | Muted text                                 |
| Slate on mist                    | 4.48:1 | **Fails body text.** Use navy (or navy/70 for small labels) on mist |
| White on violet                  | 4.65:1 | Primary buttons                            |
| Violet on white                  | 4.65:1 | OK, but prefer `violet-ink` for text       |
| Violet on canvas                 | 4.44:1 | **Fails body text.** Use `violet-ink` (5.5:1) |
| Navy on mint                     | 14.9:1 | Badges, chips                              |
| Mint on navy                     | 14.9:1 | Highlights on dark panels                  |
| `on-navy` on navy                | 9.5:1  | Muted text on dark panels                  |
| Violet on navy                   | 3.8:1  | Large text or decoration only              |

## Motion

- One purposeful moment per surface. Landing motion is CSS only (`oc-rise`, `oc-pop`, `oc-bob`, `oc-fill`, `oc-pulse`, and `oc-reveal` with scroll-driven `animation-timeline: view()`), defined in `globals.css` inside `prefers-reduced-motion: no-preference`. Browsers without scroll-driven animations just show the content.
- No animation library is needed; add one only if CSS can't do the job.

## Layout notes

- Grids that collapse to one column on phones need an explicit `grid-cols-1` (`minmax(0, 1fr)` in Tailwind v4); otherwise wide children overflow at 320px.
- Check every new page at 320px and 390px for horizontal overflow.

## Bilingual copy

The UI is Spanish first (`/es`, default) and English (`/en`) with a toggle. Any new string goes into both dictionaries in the same change: `frontend/src/i18n/dictionaries/{es,en}.ts`, and for the marketing site `landing.{es,en}.ts` and `legal.{es,en}.ts`. The English files are typed against the Spanish/English source, so a missing key fails `tsc`. Server components read strings with `getDictionary()`; client components receive the slice they need as props.

Marketing copy must stay honest: OpenCircle is a prototype with test funds, not a licensed institution; no insured, guaranteed or real-money claims; fees are examples.

## Checklist before finishing a visual change

- No `#` hex literal outside the `@theme` block, the OG image, `icon.svg` and `themeColor`.
- No font family other than Geist.
- Every new string exists in both dictionaries.
- Contrast checked for every new text/background pair (table above).
- Logo paths untouched; it is recoloured only through `currentColor`.
- No horizontal overflow at 320px.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` green in `frontend/`.

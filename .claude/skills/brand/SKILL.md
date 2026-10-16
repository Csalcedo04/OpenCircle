---
name: brand
description: Brand rules for every user-visible change in this repository — colours, typography, the logo, Tailwind v4 tokens, contrast and bilingual copy. Use it whenever the user asks for UI, layout, styling, colours, fonts, logos, icons, a new page, section or component, the 404 page, a "re-skin", "look and feel", "diseño", "colores" or "estilos", even without the word "brand". Usar en cualquier cambio visual de `frontend/`. NO usar para lógica de pagos, backend, base de datos ni textos legales; do not use for payment flows (use the Open Payments skills).
---

# Brand for OpenCircle

The brand is defined once, for the whole MDGeniusAI/OpenCircle family; this skill adapts it to the OpenCircle web app in `frontend/`. Colours, typefaces and the logo are brand decisions, not styling preferences: never invent a hex value, never substitute a font, never draw a logo.

This file is the whole brand contract for this repo; `CLAUDE.md` only points here.

## Palette

| Role      | Name            | Hex       | Tailwind token          |
| --------- | --------------- | --------- | ----------------------- |
| Primary   | Baltic Blue     | `#3A607D` | `brand-baltic-blue`     |
| Primary   | Deep Space Blue | `#082B42` | `brand-deep-space-blue` |
| Primary   | Cool Steel      | `#97B7C1` | `brand-cool-steel`      |
| Secondary | White Smoke     | `#F3F3F3` | `brand-white-smoke`     |
| Secondary | Grey            | `#7F7F7F` | `brand-grey`            |
| Secondary | Black           | `#000000` | `brand-black`           |

There are no other colours: no status greens, reds or golds. Show state with the palette plus an icon and a text label, never with colour alone.

## Typography

- **Poppins**, the only family: titles, leads, display figures, paragraphs, buttons and links. Hierarchy comes from size and weight (400 / 500 / 600 / 700), not from a second family.
- Loaded once with `next/font/google` in `frontend/src/app/[lang]/layout.tsx` as `--font-poppins`, exposed as Tailwind `font-sans` and `font-heading`.

## Logo

- The OpenCircle wordmark is the **Interledger mark standing in for the "O"**, followed by "penCircle". It lives in `frontend/src/components/logo-mark.tsx` (`LogoMark` for the mark, `Logo` for the wordmark).
- The mark is drawn with `stroke="currentColor"`, so it takes the text colour of its container: Deep Space Blue on light surfaces, White Smoke on the Deep Space Blue header. That is the only sanctioned recolour. Never edit the paths, never redraw the mark, and never put it on a background where its colour fails contrast: change the background instead.

## Where the tokens live

- **`frontend/src/app/globals.css` is the only place a colour or font is defined.** The `@theme` block holds the six `brand-*` colours, each with its brand name in a comment. The `:root` block maps shadcn's semantic tokens (`background`, `primary`, `muted-foreground`, `border`, …) onto those brand variables. Components use `bg-primary`, `text-muted-foreground`, `border-border` or `text-brand-baltic-blue`, never `bg-[#...]` or `style={{ color: ... }}`.
- If you need a role token that's missing, add it in `globals.css`, once, as a `var(--color-brand-*)` mapping or a `color-mix` of brand colours, with a comment. Never add a new hex.
- **A brand change must be one edit.** If changing Baltic Blue would touch more than its line in `@theme`, the palette has leaked; fix the leak while you're there.
- SVG illustrations (such as the circle ring) colour themselves with `currentColor` or `fill-*`/`stroke-*` Tailwind classes, never inline hex.

## Contrast

Every text/background pair must clear WCAG AA (4.5:1 normal text, 3:1 large text and UI parts). Measured:

| Text on background            | Ratio  | Use                          |
| ----------------------------- | ------ | ---------------------------- |
| Deep Space Blue on White Smoke | 13.2:1 | Body and headings            |
| Baltic Blue on White Smoke     | 6.0:1  | Secondary text, links        |
| White Smoke on Deep Space Blue | 13.2:1 | Header, dark panels          |
| Cool Steel on Deep Space Blue  | 6.9:1  | Secondary text on dark panels |
| White Smoke on Baltic Blue     | 6.0:1  | Buttons, verified badges     |
| Deep Space Blue on Cool Steel  | 6.9:1  | Badges on a Cool Steel tint  |
| Baltic Blue on Cool Steel      | 3.1:1  | Large text only              |
| Grey on White Smoke            | 3.6:1  | **Fails body text.** Borders, dashed outlines and decoration only |
| Cool Steel on Baltic Blue      | 2.2:1  | **Fails.** Never              |

Cool Steel is a tint for surfaces, borders and badges, not a text colour on light backgrounds.

## Bilingual copy

The UI is English and Spanish with a toggle. Any new string goes into both `frontend/src/i18n/dictionaries/en.ts` and `es.ts` in the same change; `es.ts` is typed against `en.ts`, so a missing key fails `tsc`. Server components read strings with `getDictionary()`; client components receive the slice they need as props.

## Checklist before finishing a visual change

- No `#` hex literal outside the `@theme` block in `globals.css`.
- No font family other than Poppins.
- Every new string exists in both dictionaries.
- Contrast checked for every new text/background pair (table above).
- Logo paths untouched; it is recoloured only through `currentColor`.
- `pnpm typecheck`, `pnpm lint` and `pnpm build` green in `frontend/`.

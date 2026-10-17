# OpenCircle — design

The full brand contract (palette, type, logo, tokens, contrast, motion, copy) lives in
[`.claude/skills/brand/SKILL.md`](.claude/skills/brand/SKILL.md). This page is a summary for people;
**if the two ever disagree, the skill wins** — update it first, then this page.

## Look and feel

A premium, approachable consumer-fintech look: deep navy text, a violet accent, soft mint highlights
on an off-white canvas, Geist throughout, generous whitespace and soft 20–32px radii (bento cards,
pill buttons). Spanish first (`/es`), English at `/en`.

## Palette

| Role | Name | Hex | Tailwind token |
|---|---|---|---|
| Primary / text | Deep navy | `#101828` | `brand-navy` |
| Accent | Violet | `#7659F5` | `brand-violet` |
| Secondary accent | Soft mint | `#BDF8DA` | `brand-mint` |
| Background | Warm off-white | `#F8FAFC` | `brand-canvas` |
| Surface | White | `#FFFFFF` | `brand-white` |
| Secondary surface | Mist | `#F1F3F9` | `brand-mist` |
| Muted text | Slate | `#667085` | `brand-slate` |

Derived: `brand-violet-ink` (violet text on light surfaces), `brand-on-navy` (muted text on navy),
`brand-line` (borders). There are no status reds, greens or yellows: state is shown with the palette
plus an icon and a label.

- Colours are defined once, in `frontend/src/app/globals.css` (`@theme`). Components use tokens
  (`bg-brand-violet`, `text-muted-foreground`), never hex values.
- Every text/background pair clears WCAG AA. Watch out for **violet on canvas** and **slate on mist**
  for body text — use `brand-violet-ink` / navy instead.

## Type and logo

- **Geist only** (variable, self-hosted). Hierarchy comes from size, weight (400–600) and tight
  tracking on large type. Money uses `tabular-nums` and `Intl.NumberFormat`.
- The wordmark is the **Interledger mark standing in for the "O"** + "penCircle"
  (`components/logo-mark.tsx`). It's recoloured only through `currentColor`; never redraw it.

## Motion

- **CSS only**, no animation library; one purposeful moment per screen.
- Everything sits inside `prefers-reduced-motion: no-preference`. With reduced motion, nothing moves.
- Existing pieces: `oc-rise`, `oc-pop`, `oc-fill`, `oc-reveal` (landing), `oc-step-in`,
  `oc-step-fill`, `oc-fade-in` (onboarding and forms).

## Layout

- Phone first: check new pages at **320px and 390px** for horizontal overflow.
- Grids that collapse to one column need an explicit `grid-cols-1` (otherwise wide children overflow).
- Below `md`, the app uses the mobile dock for navigation; the header keeps language and account.

## Copy

- Every string exists in both dictionaries (`frontend/src/i18n/dictionaries/{es,en}.ts`).
- Honest copy: a prototype with test funds — no insured, guaranteed or real-money claims.

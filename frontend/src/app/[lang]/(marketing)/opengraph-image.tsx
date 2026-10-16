import { ImageResponse } from "next/og"
import en from "@/i18n/dictionaries/en"
import es from "@/i18n/dictionaries/es"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "OpenCircle"

// Satori can't read Tailwind tokens, so brand hex values are inlined here (see the brand skill).
const NAVY = "#101828" // Deep navy
const VIOLET = "#7659f5" // Violet
const MINT = "#bdf8da" // Soft mint
const ON_NAVY = "#bcbec3" // White 72% on deep navy

export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const t = (lang === "en" ? en : es).landing
  const seats = [0, 1, 2, 3, 4]

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: NAVY, color: "#ffffff", padding: 72, position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 700 }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>OpenCircle</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 76, fontWeight: 600, lineHeight: 1.02, letterSpacing: -3 }}>{t.footer.tagline}</div>
            <div style={{ display: "flex", marginTop: 24, fontSize: 24, color: ON_NAVY }}>{t.trust.join(" · ")}</div>
          </div>
        </div>
        <div style={{ display: "flex", position: "absolute", right: 90, top: 135, width: 360, height: 360 }}>
          <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: 360, height: 360, borderRadius: 999, border: `3px solid ${VIOLET}` }} />
          <div style={{ display: "flex", position: "absolute", left: 110, top: 110, width: 140, height: 140, borderRadius: 999, background: MINT }} />
          {seats.map((i) => {
            const a = (i / seats.length) * Math.PI * 2 - Math.PI / 2
            const x = 180 + 180 * Math.cos(a) - 30
            const y = 180 + 180 * Math.sin(a) - 30
            return (
              <div
                key={i}
                style={{ display: "flex", position: "absolute", left: x, top: y, width: 60, height: 60, borderRadius: 999, background: i < 4 ? VIOLET : NAVY, border: `3px solid ${i < 4 ? VIOLET : MINT}` }}
              />
            )
          })}
        </div>
      </div>
    ),
    size,
  )
}

import { ImageResponse } from "next/og";

export const alt = "GlowHub — agenda, comandas e financeiro para beleza e estética";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #faf7fb 0%, #f3ecf6 55%, #ead3f0 100%)",
          color: "#1b1220",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "#a21caf",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="56" height="56" viewBox="0 0 64 64">
              <path
                d="M43.5 22.5A14 14 0 1 0 46 33H33"
                fill="none"
                stroke="#fff"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="46" cy="17" r="3.5" fill="#fff" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700 }}>
            Glow<span style={{ color: "#a21caf" }}>Hub</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 960 }}>
            Sua agenda cheia e o caixa em dia, no mesmo lugar.
          </div>
          <div style={{ fontSize: 30, color: "#5b4a63" }}>
            Agenda, agendamento online, comandas, clientes e financeiro para beleza e estética.
          </div>
        </div>
      </div>
    ),
    size,
  );
}

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#a21caf",
        }}
      >
        <svg width="132" height="132" viewBox="0 0 64 64">
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
    ),
    size,
  );
}

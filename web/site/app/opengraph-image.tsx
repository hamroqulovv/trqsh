import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

// The card shown when a trqsh link is shared. Black and white like the site.
export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0c0c0e",
          color: "#f5f5f7",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 19,
              background: "#f5f5f7",
              color: "#0c0c0e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              fontWeight: 700,
            }}
          >
            {">_"}
          </div>
          <div style={{ fontSize: 60, fontWeight: 700, letterSpacing: -3 }}>{site.name}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 92, fontWeight: 700, letterSpacing: -4, lineHeight: 1.05 }}>
            Your localhost.
          </div>
          <div style={{ fontSize: 92, fontWeight: 700, letterSpacing: -4, lineHeight: 1.05, color: "#9d9da8" }}>
            Now everywhere.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 30,
            color: "#bebec6",
            fontFamily: "monospace",
          }}
        >
          <span style={{ color: "#6a6a71" }}>$</span>
          <span>trqsh http 3000</span>
          <span style={{ color: "#6a6a71" }}>→</span>
          <span>{`your-app.${site.tunnelDomain}`}</span>
        </div>
      </div>
    ),
    size,
  );
}

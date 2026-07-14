import { ImageResponse } from "next/og"

export const alt = "SmartBot - منصة إدارة فيسبوك"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* glow */}
        <div
          style={{
            position: "absolute",
            top: "-30%",
            right: "-20%",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(200,78,0,0.25) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-20%",
            left: "-10%",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(200,78,0,0.15) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "20px",
          }}
        >
          {/* logo */}
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "12px",
              background: "#c84e00",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "28px",
              fontWeight: 900,
            }}
          >
            S
          </div>
          <span
            style={{
              fontSize: "48px",
              fontWeight: 700,
              color: "#f5f5f5",
              letterSpacing: "-0.02em",
            }}
          >
            SmartBot
          </span>
        </div>
        <h1
          style={{
            fontSize: "52px",
            fontWeight: 800,
            color: "#f5f5f5",
            textAlign: "center",
            lineHeight: 1.2,
            margin: 0,
            maxWidth: "800px",
          }}
        >
          منصة إدارة تفاعل فيسبوك
        </h1>
        <p
          style={{
            fontSize: "24px",
            color: "#a0a0a0",
            textAlign: "center",
            marginTop: "16px",
          }}
        >
          أتمتة الردود · تحليلات متقدمة · إدارة متكاملة
        </p>
      </div>
    ),
    { ...size },
  )
}

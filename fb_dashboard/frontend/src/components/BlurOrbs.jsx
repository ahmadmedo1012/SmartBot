export function BlurOrbs() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      <div style={{ position: "absolute", width: "70vmin", height: "70vmin", top: "0", left: "50%", transform: "translateX(-50%)", borderRadius: "50%", filter: "blur(120px)", background: "radial-gradient(circle, oklch(0.55 0.19 45 / 0.15), transparent 70%)" }} />
      <div style={{ position: "absolute", width: "50vmin", height: "50vmin", bottom: "-10%", right: "-5%", borderRadius: "50%", filter: "blur(120px)", background: "radial-gradient(circle, oklch(0.55 0.19 45 / 0.08), transparent 70%)" }} />
      <div style={{ position: "absolute", width: "40vmin", height: "40vmin", top: "30%", left: "-5%", borderRadius: "50%", filter: "blur(120px)", background: "radial-gradient(circle, oklch(0.62 0.14 45 / 0.06), transparent 70%)" }} />
    </div>
  )
}

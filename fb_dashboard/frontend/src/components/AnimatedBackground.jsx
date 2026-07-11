import { useEffect, useRef } from "react"

// resolve --accent CSS var to comma-HSL for Canvas2D (no space-syntax support)
let _accH = "29", _accS = "100%", _accL = "55%"
function resolveAccent() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()
  // v = "29 100% 55%"
  const p = v.split(/\s+/)
  if (p.length === 3) { _accH = p[0]; _accS = p[1]; _accL = p[2] }
}
// ponytail: one-off read at animation start + on class change; won't drift otherwise

export function AnimatedBackground() {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    let raf = null; let particles = []
    const COUNT = 25
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize(); window.addEventListener("resize", resize)
    for (let i = 0; i < COUNT; i++) {
      particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3 - 0.1, r: Math.random() * 2 + 1, a: Math.random() * 0.3 + 0.1 })
    }
    let t = 0
    resolveAccent()
    const obs = new MutationObserver(() => { resolveAccent() })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    // cache accent parts locally each frame to minimise closure churn
    function animate() {
      t += 0.005; ctx.clearRect(0, 0, canvas.width, canvas.height)
      const cx = canvas.width / 2, cy = canvas.height / 2
      const r1 = Math.min(canvas.width, canvas.height) * 0.6
      const r2 = r1 * 0.8, r3 = r1 * 0.6
      // accent blob
      const g1 = ctx.createRadialGradient(cx + Math.sin(t * 0.3) * 100, cy + Math.cos(t * 0.4) * 80, 0, cx + Math.sin(t * 0.3) * 100, cy + Math.cos(t * 0.4) * 80, r1)
      g1.addColorStop(0, `hsla(${_accH}, ${_accS}, ${_accL}, 0.05)`)
      g1.addColorStop(1, "transparent")
      ctx.fillStyle = g1; ctx.fillRect(0, 0, canvas.width, canvas.height)
      // secondary blob
      const g2 = ctx.createRadialGradient(canvas.width * 0.3 + Math.sin(t * 0.5) * 120, canvas.height * 0.3 + Math.cos(t * 0.3) * 100, 0, canvas.width * 0.3 + Math.sin(t * 0.5) * 120, canvas.height * 0.3 + Math.cos(t * 0.3) * 100, r2)
      g2.addColorStop(0, `hsla(260, 60%, 60%, 0.03)`)
      g2.addColorStop(1, "transparent")
      ctx.fillStyle = g2; ctx.fillRect(0, 0, canvas.width, canvas.height)
      // tertiary blob
      const g3 = ctx.createRadialGradient(canvas.width * 0.7 + Math.sin(t * 0.4) * 80, canvas.height * 0.7 + Math.cos(t * 0.5) * 60, 0, canvas.width * 0.7 + Math.sin(t * 0.4) * 80, canvas.height * 0.7 + Math.cos(t * 0.5) * 60, r3)
      g3.addColorStop(0, `hsla(${_accH}, ${_accS}, ${_accL}, 0.03)`)
      g3.addColorStop(1, "transparent")
      ctx.fillStyle = g3; ctx.fillRect(0, 0, canvas.width, canvas.height)
      // particles
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${_accH}, ${_accS}, ${_accL}, ${p.a})`
        ctx.fill()
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${_accH}, ${_accS}, ${_accL}, ${p.a * 0.2})`
        ctx.fill()
      }
      raf = requestAnimationFrame(animate)
    }
    animate()
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); obs.disconnect() }
  }, [])
  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" style={{opacity:.5}} aria-hidden="true" />
}

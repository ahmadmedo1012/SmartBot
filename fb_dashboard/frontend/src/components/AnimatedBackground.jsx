import { useEffect, useRef } from "react"

function getAccentHSL() {
  const el = document.documentElement
  const val = getComputedStyle(el).getPropertyValue("--accent").trim()
  // val = "29 100% 55%"
  return `hsla(${val}, 0.04)`
}

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
    let accentHSL = getAccentHSL()
    const obs = new MutationObserver(() => { accentHSL = getAccentHSL() })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    function animate() {
      t += 0.005; ctx.clearRect(0, 0, canvas.width, canvas.height)
      const cx = canvas.width / 2, cy = canvas.height / 2
      const r1 = Math.min(canvas.width, canvas.height) * 0.6
      const r2 = r1 * 0.8, r3 = r1 * 0.6
      const accentBlob = accentHSL.replace("0.04", "0.05")
      const g1 = ctx.createRadialGradient(cx + Math.sin(t * 0.3) * 100, cy + Math.cos(t * 0.4) * 80, 0, cx + Math.sin(t * 0.3) * 100, cy + Math.cos(t * 0.4) * 80, r1)
      g1.addColorStop(0, accentBlob); g1.addColorStop(1, "transparent")
      ctx.fillStyle = g1; ctx.fillRect(0, 0, canvas.width, canvas.height)
      const g2 = ctx.createRadialGradient(canvas.width * 0.3 + Math.sin(t * 0.5) * 120, canvas.height * 0.3 + Math.cos(t * 0.3) * 100, 0, canvas.width * 0.3 + Math.sin(t * 0.5) * 120, canvas.height * 0.3 + Math.cos(t * 0.3) * 100, r2)
      g2.addColorStop(0, "hsla(260, 60%, 60%, 0.03)"); g2.addColorStop(1, "transparent")
      ctx.fillStyle = g2; ctx.fillRect(0, 0, canvas.width, canvas.height)
      const g3 = ctx.createRadialGradient(canvas.width * 0.7 + Math.sin(t * 0.4) * 80, canvas.height * 0.7 + Math.cos(t * 0.5) * 60, 0, canvas.width * 0.7 + Math.sin(t * 0.4) * 80, canvas.height * 0.7 + Math.cos(t * 0.5) * 60, r3)
      g3.addColorStop(0, "hsla(29, 100%, 55%, 0.03)"); g3.addColorStop(1, "transparent")
      ctx.fillStyle = g3; ctx.fillRect(0, 0, canvas.width, canvas.height)
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = "hsla(var(--accent) / " + p.a + ")"
        ctx.fill()
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2)
        ctx.fillStyle = "hsla(var(--accent) / " + (p.a * 0.2) + ")"
        ctx.fill()
      }
      raf = requestAnimationFrame(animate)
    }
    animate()
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); obs.disconnect() }
  }, [])
  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" style={{opacity:.5}} aria-hidden="true" />
}

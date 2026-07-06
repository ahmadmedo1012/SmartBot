import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { login } from "@/lib/api"
import { Eye, EyeOff, Lock, User } from "lucide-react"

function Particles() {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    let anim
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * 800, y: Math.random() * 600,
      vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6,
      r: Math.random() * 1.8 + 0.5,
    }))
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize(); window.addEventListener("resize", resize)
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = "hsla(348, 80%, 60%, 0.25)"
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
      })
      anim = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(anim); window.removeEventListener("resize", resize) }
  }, [])
  return <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" />
}

export function Login({ onAuth }) {
  useEffect(() => { document.title = "تسجيل الدخول | SmartBot" }, [])
  const [isDark, setIsDark] = useState(true)
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"))
    const observer = new MutationObserver(() => setIsDark(document.documentElement.classList.contains("dark")))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(""); setLoading(true)
    try {
      const res = await login(username, password)
      onAuth(res)
    } catch (err) {
      setError(err.message || "فشل تسجيل الدخول")
    } finally { setLoading(false) }
  }

  const bgGradient = isDark
    ? "linear-gradient(135deg, hsl(220 25% 4%), hsl(348 70% 8%))"
    : "linear-gradient(135deg, hsl(220 20% 92%), hsl(348 30% 90%))"

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden" style={{ background: bgGradient }}>
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full rounded-full" style={{ background: isDark ? 'radial-gradient(ellipse, hsl(348 80% 50% / 0.25), transparent 60%)' : 'radial-gradient(ellipse, hsl(348 80% 50% / 0.1), transparent 60%)' }} />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full rounded-full" style={{ background: isDark ? 'radial-gradient(ellipse, hsl(211 90% 55% / 0.15), transparent 60%)' : 'radial-gradient(ellipse, hsl(211 90% 55% / 0.08), transparent 60%)' }} />
      </div>
      <Particles />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-sm mx-auto p-5"
      >
        <div className={`relative rounded-2xl border p-8 space-y-6 shadow-2xl ${isDark ? 'border-white/10 bg-white/5 backdrop-blur-2xl' : 'border-border bg-card'}`}>
          <div className="text-center space-y-3">
            <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center p-3 ${isDark ? 'bg-white/10 border border-white/10' : 'bg-primary/10 border border-primary/20'}`}>
              <img src="/static/favicon.svg" alt="SmartBot" className={`w-full h-full ${isDark ? '' : 'brightness-0'}`} style={isDark ? {} : { filter: 'brightness(0) saturate(100%) hue-rotate(330deg)' }} />
            </div>
            <div className="space-y-1">
              <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-foreground'}`}>SmartBot</h1>
              <p className={`text-sm ${isDark ? 'text-white/60' : 'text-muted-foreground'}`}>لوحة التحكم</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className={`text-xs font-medium pr-1 ${isDark ? 'text-white/70' : 'text-muted-foreground'}`}>اسم المستخدم</label>
              <div className="relative">
                <User className={`absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-white/40' : 'text-muted-foreground/60'}`} />
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className={`w-full h-10 pr-9 pl-3 rounded-xl border text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all ${isDark ? 'border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-primary/60' : 'border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary'}`}
                  placeholder="اسم المستخدم"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={`text-xs font-medium pr-1 ${isDark ? 'text-white/70' : 'text-muted-foreground'}`}>كلمة المرور</label>
              <div className="relative">
                <Lock className={`absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 ${isDark ? 'text-white/40' : 'text-muted-foreground/60'}`} />
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={`w-full h-10 pr-9 pl-10 rounded-xl border text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all ${isDark ? 'border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-primary/60' : 'border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-primary'}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${isDark ? 'text-white/40 hover:text-white/70' : 'text-muted-foreground hover:text-foreground'}`}
                  aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-sm text-destructive text-center">
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold text-sm transition-all active:scale-[0.98] shadow-lg shadow-primary/25"
            >
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground animate-[bounce_0.8s_infinite_0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground animate-[bounce_0.8s_infinite_150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground animate-[bounce_0.8s_infinite_300ms]" />
                </span>
              ) : "تسجيل الدخول"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}

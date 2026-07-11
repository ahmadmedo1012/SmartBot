import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { login } from "@/lib/api"
import { Bot, Eye, EyeOff, Lock, Loader2, User } from "lucide-react"

function AnimatedBg() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04]"
        style={{ backgroundImage: 'linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      {/* Morphing liquid glass blob — primary */}
      <motion.div
        className="absolute -top-32 -right-32 w-[600px] h-[600px] blob-morph"
        style={{ background: 'radial-gradient(ellipse, hsl(var(--primary) / 0.2), transparent 70%)' }}
        animate={{ x: [0, 40, -30, 0], y: [0, -50, 30, 0], scale: [1, 1.05, 0.95, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Morphing liquid glass blob — accent */}
      <motion.div
        className="absolute -bottom-32 -left-32 w-[550px] h-[550px] blob-morph"
        style={{ background: 'radial-gradient(ellipse, hsl(var(--accent) / 0.15), transparent 70%)' }}
        animate={{ x: [0, -40, 30, 0], y: [0, 50, -30, 0], scale: [1, 0.95, 1.05, 1] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />
      {/* Floating iridescent orb */}
      <motion.div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full"
        style={{ background: 'radial-gradient(ellipse, hsl(190 70% 50% / 0.06), transparent 60%)' }}
        animate={{ x: [0, 60, -40, 0], y: [0, 40, -60, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
    </div>
  )
}

function AnimatedGradientBorder({ children }) {
  return (
    <div className="relative group">
      {/* Animated gradient border ring */}
      <div className="absolute -inset-[1px] rounded-2xl opacity-75 group-hover:opacity-100 transition-opacity duration-700"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--primary) / 0.5), hsl(var(--accent) / 0.3), hsl(var(--primary) / 0.1), hsl(var(--accent) / 0.4))',
          backgroundSize: '300% 300%',
          animation: 'shimmer 6s ease-in-out infinite',
          mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          maskComposite: 'exclude',
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          padding: '1px',
        }} />
      {children}
    </div>
  )
}

export function Login({ onAuth }) {
  useEffect(() => { document.title = "تسجيل الدخول | SmartBot" }, [])
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})

  const validate = () => {
    const errs = {}
    const emailLike = username.includes("@")
    if (emailLike && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
      errs.username = "صيغة البريد الإلكتروني غير صحيحة"
    }
    if (password.length > 0 && password.length < 4) {
      errs.password = "كلمة المرور يجب أن تكون 4 أحرف على الأقل"
    }
    setFieldErrors(errs)
    return !Object.keys(errs).length
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    if (!validate()) return
    setLoading(true)
    try {
      const res = await login(username, password)
      onAuth(res)
    } catch (err) {
      setError(err.message || "فشل تسجيل الدخول")
    } finally { setLoading(false) }
  }

  const inputBorder = (err) =>
    err ? "border-destructive/60" : "border-border/40 focus:border-accent/60"

  // ponytail: floating label via peer/placeholder-shown; peer-focus overrides empty-state centering
  const labelBase = [
    "absolute pointer-events-none transition-all duration-200 z-10",
    "right-10 top-2 text-[11px] text-foreground/60",
    "peer-placeholder-shown:right-10 peer-placeholder-shown:top-1/2",
    "peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm",
    "peer-placeholder-shown:text-muted-foreground/60",
    "peer-focus:text-accent/80 peer-focus:top-2 peer-focus:translate-y-0",
  ].join(" ")

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden dark:login-bg login-bg-light">
      <AnimatedBg />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-sm mx-auto p-4 sm:p-5"
      >
        <AnimatedGradientBorder>
          <div className="relative rounded-2xl p-6 sm:p-8 space-y-6 glass-liquid">
            {/* Logo */}
            <div className="text-center space-y-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.15 }}
                className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center bg-muted/30 border border-border/20"
              >
                <Bot className="w-10 h-10 text-accent" strokeWidth={1.5} />
              </motion.div>
              <div className="space-y-1.5">
                <h1 className="text-3xl font-bold text-iridescent">SmartBot</h1>
                <p className="text-sm text-muted-foreground">لوحة التحكم الذكية</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username / Email */}
              <div className="space-y-1">
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 z-10" />
                  <input
                    id="username"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setFieldErrors((p) => ({...p, username: ""})) }}
                    required
                    className={`peer w-full h-11 pr-10 pl-3 rounded-xl text-sm outline-none transition-all bg-background/50 border ${inputBorder(fieldErrors.username)} text-foreground placeholder:text-transparent focus:bg-background/80`}
                    placeholder="اسم المستخدم أو البريد الإلكتروني"
                    autoComplete="username"
                  />
                  <label htmlFor="username" className={labelBase}>
                    اسم المستخدم
                  </label>
                </div>
                {fieldErrors.username && (
                  <p className="text-xs text-destructive pr-1">{fieldErrors.username}</p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1">
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 z-10" />
                  <input
                    id="password"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({...p, password: ""})) }}
                    required
                    className={`peer w-full h-11 pr-10 pl-10 rounded-xl text-sm outline-none transition-all bg-background/50 border ${inputBorder(fieldErrors.password)} text-foreground placeholder:text-transparent focus:bg-background/80`}
                    placeholder="كلمة المرور"
                    autoComplete="current-password"
                  />
                  <label htmlFor="password" className={labelBase}>
                    كلمة المرور
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors text-muted-foreground/60 hover:text-foreground cursor-pointer z-10"
                    aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-xs text-destructive pr-1">{fieldErrors.password}</p>
                )}
              </div>

              {/* Server error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  role="alert"
                  className="p-3 rounded-xl text-sm text-center bg-destructive/10 border border-destructive/30 text-destructive"
                >
                  {error}
                </motion.div>
              )}

              {/* Submit */}
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="relative w-full h-12 rounded-xl text-white font-semibold text-sm overflow-hidden shadow-lg shadow-accent/20 dark:shadow-accent/25 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--accent))] hover:brightness-110 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                ) : "تسجيل الدخول"}
              </motion.button>
            </form>
          </div>
        </AnimatedGradientBorder>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-center text-[11px] mt-6 tracking-wider text-muted-foreground/40"
        >
          SmartBot v1.0 — منصة إدارة التفاعل الذكية
        </motion.p>
      </motion.div>
    </div>
  )
}

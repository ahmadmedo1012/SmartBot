import { useState, useEffect } from "react"
import { login, register } from "@/lib/api"
import { toast } from "sonner"

function AnimatedBg() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(var(--fg) 1px, transparent 1px), linear-gradient(90deg, var(--fg) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      <div className="animate-blob-1 absolute -top-32 right-0 w-[600px] h-[600px]"
        style={{ background: 'radial-gradient(ellipse, color-mix(in oklch, var(--accent) 15%, transparent), transparent 70%)' }} />
      <div className="animate-blob-2 absolute -bottom-32 left-0 w-[550px] h-[550px]"
        style={{ background: 'radial-gradient(ellipse, color-mix(in oklch, var(--accent) 10%, transparent), transparent 70%)' }} />
      <div className="animate-blob-3 absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full"
        style={{ background: 'radial-gradient(ellipse, color-mix(in oklch, oklch(70% 0.15 190) 6%, transparent), transparent 60%)' }} />
    </div>
  )
}

function AnimatedGradientBorder({ children }) {
  return (
    <div className="relative group">
      <div className="absolute -inset-[1px] rounded-2xl opacity-75 group-hover:opacity-100 transition-opacity duration-700"
        style={{
          background: 'linear-gradient(135deg, color-mix(in oklch, var(--accent) 35%, transparent), color-mix(in oklch, var(--accent) 15%, transparent), color-mix(in oklch, var(--fg) 8%, transparent), color-mix(in oklch, var(--accent) 25%, transparent))',
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
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [checkingAuth, setCheckingAuth] = useState(true)

  // Redirect already-authenticated users
  useEffect(() => {
    fetch("/api/me")
      .then(r => r.json())
      .then(d => {
        if (d.authenticated) {
          window.location.replace("/dashboard")
        } else {
          setCheckingAuth(false)
        }
      })
      .catch(() => setCheckingAuth(false))
  }, [])

  if (checkingAuth) {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden" style={{background:"var(--bg)"}}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full animate-pulse" style={{background:"var(--accent)"}} />
          <span style={{fontSize:"14px",color:"var(--muted)"}}>جاري التحميل...</span>
        </div>
      </div>
    )
  }

  const validate = () => {
    const errs = {}
    if (isRegister) {
      if (!email.includes("@")) errs.email = "البريد الإلكتروني غير صالح"
      if (password.length < 6) errs.password = "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
    } else {
      const emailLike = username.includes("@")
      if (emailLike && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
        errs.username = "صيغة البريد الإلكتروني غير صحيحة"
      }
      if (password.length > 0 && password.length < 4) {
        errs.password = "كلمة المرور يجب أن تكون 4 أحرف على الأقل"
      }
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
      if (isRegister) {
        const res = await register(username, email, password)
        toast.success("تم إنشاء الحساب بنجاح")
        onAuth(res)
      } else {
        const res = await login(username, password)
        onAuth(res)
      }
    } catch (err) {
      const msg = err.message || "فشل"
      setError(msg)
      if (isRegister) toast.error(msg)
    } finally { setLoading(false) }
  }

  const toggleMode = () => {
    setIsRegister(!isRegister)
    setError("")
    setFieldErrors({})
    setEmail("")
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden" style={{background:"var(--bg)"}}>
      <AnimatedBg />

      <div className="login-card-enter relative z-10 w-full max-w-sm mx-auto p-4 sm:p-5">
        <AnimatedGradientBorder>
          <div className="relative rounded-2xl p-6 sm:p-8 glass-card card-hover-glow">
            {/* Logo */}
            <div className="text-center mb-6">
              <div className="login-logo-enter w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center overflow-hidden bg-accent card-glow-strong" style={{background: "linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 70%, oklch(0% 0 0)))", boxShadow: "var(--shadow-glow)"}}>
                <img src="/static/favicon.png" alt="SmartBot" className="w-12 h-12 object-contain" />
              </div>
              <h1 className="text-3xl font-bold text-gradient-premium">SmartBot</h1>
              <div className="flex items-center justify-center gap-2 mt-2">
                <p style={{ fontSize: "14px", color: "var(--muted)" }}>{isRegister ? "إنشاء حساب جديد" : "لوحة التحكم الذكية"}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Username */}
              <div className="relative mb-4">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", zIndex: 1 }}>
                  <circle cx="6" cy="5" r="3"/><path d="M1 14v-1a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1"/>
                </svg>
                <label htmlFor="username" className="sr-only" style={{position:"absolute",width:1,height:1,overflow:"hidden",clip:"rect(0,0,0,0)"}}>
                  {isRegister ? "اسم المستخدم" : "اسم المستخدم أو البريد الإلكتروني"}
                </label>
                <input
                  id="username"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setFieldErrors((p) => ({...p, username: ""})) }}
                  required
                  className="peer w-full h-11 pr-10 pl-3 rounded-xl text-sm transition-all"
                  style={{ background: "color-mix(in oklch, var(--bg) 50%, transparent)", border: "1px solid color-mix(in oklch, var(--border) 40%, transparent)", color: "var(--fg)" }}
                  placeholder={isRegister ? "اسم المستخدم" : "اسم المستخدم أو البريد الإلكتروني"}
                  autoComplete="username"
                />
                {fieldErrors.username && (
                  <p style={{ fontSize: "12px", color: "var(--danger)", paddingRight: 4, marginTop: 4 }}>{fieldErrors.username}</p>
                )}
              </div>

              {/* Email — register only */}
              {isRegister && (
                <div className="relative mb-4">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", zIndex: 1 }}>
                    <rect x="2" y="4" width="12" height="9" rx="2"/><path d="M2 5l6 4.5L14 5"/>
                  </svg>
                  <label htmlFor="email" className="sr-only" style={{position:"absolute",width:1,height:1,overflow:"hidden",clip:"rect(0,0,0,0)"}}>
                    البريد الإلكتروني
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({...p, email: ""})) }}
                    required
                    className="peer w-full h-11 pr-10 pl-3 rounded-xl text-sm transition-all"
                    style={{ background: "color-mix(in oklch, var(--bg) 50%, transparent)", border: "1px solid color-mix(in oklch, var(--border) 40%, transparent)", color: "var(--fg)" }}
                    placeholder="البريد الإلكتروني"
                    autoComplete="email"
                  />
                  {fieldErrors.email && (
                    <p style={{ fontSize: "12px", color: "var(--danger)", paddingRight: 4, marginTop: 4 }}>{fieldErrors.email}</p>
                  )}
                </div>
              )}

              {/* Password */}
              <div className="relative mb-4">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", zIndex: 1 }}>
                  <rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>
                </svg>
                <label htmlFor="password" className="sr-only" style={{position:"absolute",width:1,height:1,overflow:"hidden",clip:"rect(0,0,0,0)"}}>
                  كلمة المرور
                </label>
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({...p, password: ""})) }}
                  required
                  className="peer w-full h-11 pr-10 pl-10 rounded-xl text-sm transition-all"
                  style={{ background: "color-mix(in oklch, var(--bg) 50%, transparent)", border: "1px solid color-mix(in oklch, var(--border) 40%, transparent)", color: "var(--fg)" }}
                  placeholder="كلمة المرور"
                  autoComplete={isRegister ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", background: "none", border: "none", cursor: "pointer", zIndex: 1 }}
                  aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showPw ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/><path d="M2 2l12 12"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>
                  )}
                </button>
                {fieldErrors.password && (
                  <p style={{ fontSize: "12px", color: "var(--danger)", paddingRight: 4, marginTop: 4 }}>{fieldErrors.password}</p>
                )}
              </div>

              {/* Server error */}
              {error && (
                <div role="alert" className="login-error-in p-3 rounded-xl text-sm text-center" style={{ background: "color-mix(in oklch, var(--danger) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", color: "var(--danger)", marginBottom: 16 }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{ width: "100%", height: 48, justifyContent: "center", borderRadius: 12, fontSize: 14 }}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : isRegister ? "إنشاء حساب" : "تسجيل الدخول"}
              </button>
            </form>

            {/* Toggle link */}
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={toggleMode}
                style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "13px" }}
              >
                {isRegister ? "لديك حساب بالفعل؟ سجل دخول" : "ليس لديك حساب؟ سجل الآن"}
              </button>
            </div>
          </div>
        </AnimatedGradientBorder>

        <p className="login-fade-in text-center" style={{ fontSize: "11px", marginTop: 24, color: "color-mix(in oklch, var(--muted) 40%, transparent)", letterSpacing: "0.05em" }}>
          SmartBot - منصة إدارة التفاعل الذكية
        </p>
      </div>
    </div>
  )
}

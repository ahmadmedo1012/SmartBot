import { useState, useEffect } from "react"
import { register as apiRegister } from "@/lib/api"
import { AnimatedBg, AnimatedGradientBorder } from "@/pages/login"

export function Register() {
  useEffect(() => { document.title = "إنشاء حساب | SmartBot" }, [])
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [email, setEmail] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})

  const validate = () => {
    const errs = {}
    if (username.trim().length > 0 && username.trim().length < 3) {
      errs.username = "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "صيغة البريد الإلكتروني غير صحيحة"
    }
    if (password && password.length < 6) {
      errs.password = "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
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
      await apiRegister(username, password, email, companyName)
      setSuccess(true)
    } catch (err) {
      setError(err.message || "فشل إنشاء الحساب")
    } finally { setLoading(false) }
  }

  if (success) {
    return (
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden login-bg-light">
        <AnimatedBg />
        <div className="relative z-10 w-full max-w-sm mx-auto p-4">
          <AnimatedGradientBorder>
            <div className="relative rounded-2xl p-6 sm:p-8 glass-liquid text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "color-mix(in oklch, var(--success) 20%, transparent)" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h2 className="text-2xl font-bold text-iridescent mb-2">تم إنشاء الحساب بنجاح ✅</h2>
              <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: 20 }}>
                يمكنك الآن تسجيل الدخول والبدء في استخدام SmartBot.
              </p>
              <a href="/login" className="btn btn-primary" style={{ display: "inline-flex", padding: "12px 32px", borderRadius: 12, fontSize: 14 }}
                onClick={(e) => { e.preventDefault(); window.location.href = "/login"; }}>
                تسجيل الدخول
              </a>
            </div>
          </AnimatedGradientBorder>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden login-bg-light">
      <AnimatedBg />

      <div className="login-card-enter relative z-10 w-full max-w-sm mx-auto p-4 sm:p-5">
        <AnimatedGradientBorder>
          <div className="relative rounded-2xl p-6 sm:p-8 glass-liquid">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-iridescent">إنشاء حساب</h1>
              <p style={{ fontSize: "14px", color: "var(--muted)", marginTop: 6 }}>اشترك في SmartBot وابدأ الآن</p>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Username */}
              <div className="relative mb-4">
                <input
                  id="reg-username"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setFieldErrors((p) => ({...p, username: ""})) }}
                  required
                  className="peer w-full h-11 pr-4 pl-3 rounded-xl text-sm transition-all"
                  style={{ background: "color-mix(in oklch, var(--bg) 50%, transparent)", border: "1px solid color-mix(in oklch, var(--border) 40%, transparent)", color: "var(--fg)" }}
                  placeholder="اسم المستخدم *"
                  autoComplete="username"
                />
                {fieldErrors.username && (
                  <p style={{ fontSize: "12px", color: "var(--danger)", paddingRight: 4, marginTop: 4 }}>{fieldErrors.username}</p>
                )}
              </div>

              {/* Email */}
              <div className="relative mb-4">
                <input
                  id="reg-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({...p, email: ""})) }}
                  className="peer w-full h-11 pr-4 pl-3 rounded-xl text-sm transition-all"
                  style={{ background: "color-mix(in oklch, var(--bg) 50%, transparent)", border: "1px solid color-mix(in oklch, var(--border) 40%, transparent)", color: "var(--fg)" }}
                  placeholder="البريد الإلكتروني"
                  autoComplete="email"
                />
                {fieldErrors.email && (
                  <p style={{ fontSize: "12px", color: "var(--danger)", paddingRight: 4, marginTop: 4 }}>{fieldErrors.email}</p>
                )}
              </div>

              {/* Company */}
              <div className="relative mb-4">
                <input
                  id="reg-company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="peer w-full h-11 pr-4 pl-3 rounded-xl text-sm transition-all"
                  style={{ background: "color-mix(in oklch, var(--bg) 50%, transparent)", border: "1px solid color-mix(in oklch, var(--border) 40%, transparent)", color: "var(--fg)" }}
                  placeholder="اسم الشركة (اختياري)"
                  autoComplete="organization"
                />
              </div>

              {/* Password */}
              <div className="relative mb-4">
                <input
                  id="reg-password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({...p, password: ""})) }}
                  required
                  minLength={6}
                  className="peer w-full h-11 pr-4 pl-10 rounded-xl text-sm transition-all"
                  style={{ background: "color-mix(in oklch, var(--bg) 50%, transparent)", border: "1px solid color-mix(in oklch, var(--border) 40%, transparent)", color: "var(--fg)" }}
                  placeholder="كلمة المرور * (6 أحرف على الأقل)"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", background: "none", border: "none", cursor: "pointer", zIndex: 1 }}
                  aria-label={showPw ? "إخفاء" : "إظهار"}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    {showPw
                      ? <><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/><path d="M2 2l12 12"/></>
                      : <><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></>
                    }
                  </svg>
                </button>
                {fieldErrors.password && (
                  <p style={{ fontSize: "12px", color: "var(--danger)", paddingRight: 4, marginTop: 4 }}>{fieldErrors.password}</p>
                )}
              </div>

              {/* Error */}
              {error && (
                <div role="alert" className="p-3 rounded-xl text-sm text-center" style={{ background: "color-mix(in oklch, var(--danger) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", color: "var(--danger)", marginBottom: 16 }}>
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
                ) : "إنشاء الحساب"}
              </button>
            </form>

            <p className="text-center" style={{ fontSize: "13px", marginTop: 20, color: "var(--muted)" }}>
              لديك حساب بالفعل؟{" "}
              <a href="/login" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
                onClick={(e) => { e.preventDefault(); window.location.href = "/login"; }}>
                تسجيل الدخول
              </a>
            </p>
          </div>
        </AnimatedGradientBorder>

        <p className="login-fade-in text-center" style={{ fontSize: "11px", marginTop: 24, color: "color-mix(in oklch, var(--muted) 40%, transparent)" }}>
          SmartBot v1.0 — منصة إدارة التفاعل الذكية
        </p>
      </div>
    </div>
  )
}

import { useState, useEffect } from "react"
import { fetchPlans, fetchPublicConfig, validateSubscription, createSubscription, pollSubscriptionStatus, register, login } from "@/lib/api"
import { toast } from "sonner"
import { Sparkles, ArrowLeft } from "lucide-react"
import { PlanCard } from "@/components/PlanCard"
import { AnnualToggle } from "@/components/AnnualToggle"

export function Subscribe({ onAuth, onNavigate }) {
  const [plans, setPlans] = useState([])
  const [config, setConfig] = useState({})
  const [step, setStep] = useState("select") // select | form | payment | waiting | success | rejected
  const [annual, setAnnual] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [form, setForm] = useState({ username: "", password: "", name: "", phone: "", email: "" })
  const [paymentId, setPaymentId] = useState(null)
  const [countdown, setCountdown] = useState(60)
  const [polling, setPolling] = useState(false)

  useEffect(() => {
    fetchPlans().then(setPlans).catch(() => {})
    fetchPublicConfig().then(setConfig).catch(() => {})
  }, [])

  // Poll subscription status
  useEffect(() => {
    if (!polling || !paymentId) return
    const interval = setInterval(async () => {
      try {
        const res = await pollSubscriptionStatus(paymentId)
        if (res.status === "verified") {
          setPolling(false)
          setStep("success")
          toast.success("تم تفعيل اشتراكك! 🎉")
          clearInterval(interval)
        } else if (res.status === "cancelled") {
          setPolling(false)
          setStep("rejected")
          toast.error("تم رفض طلب الدفع")
          clearInterval(interval)
        }
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [polling, paymentId])

  // Countdown timer
  useEffect(() => {
    if (step !== "waiting") return
    if (countdown <= 0) { setStep("success"); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [step, countdown])

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan)
    setStep("form")
  }

  const handleSubmit = async () => {
    if (!form.username || !form.password || !form.phone) {
      toast.error("يرجى ملء جميع الحقول المطلوبة")
      return
    }
    try {
      // Validate unique username
      const val = await validateSubscription({ username: form.username })
      if (!val.valid) { toast.error(val.error); return }

      // Register user first
      try {
        await register(form.username, form.email || `${form.username}@smartbot.ly`, form.password)
      } catch (e) {
        toast.error("فشل إنشاء الحساب: " + e.message)
        return
      }

      // Login to set cookie
      try {
        const loginRes = await login(form.username, form.password)
        form.name = loginRes.username || form.username
      } catch {}

      if (selectedPlan.price === 0) {
        // Free plan — skip payment
        onAuth && onAuth({ username: form.username, role: "admin" })
        toast.success("تم إنشاء حسابك المجاني!")
        return
      }

      // Create subscription payment
      const res = await createSubscription({
        phone: form.phone,
        amount: annual ? selectedPlan.price * 10 : selectedPlan.price,
        provider: "libyana",
        plan_id: selectedPlan.id,
      })
      setPaymentId(res.payment_id)
      setStep("payment")
      setCountdown(60)
      setPolling(true)
    } catch (e) {
      toast.error(e.message || "فشل إنشاء طلب الدفع")
    }
  }

  if (!plans.length) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", direction: "rtl" }}>
      <div className="grain-overlay" />
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Header */}
        <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
          <button onClick={() => onNavigate && onNavigate("landing")} className="btn btn-outline btn-sm">
            <ArrowLeft size={16} /> العودة
          </button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>SmartBot</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>الاشتراك</span>
        </header>

        <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px" }}>
          {step === "select" && (
            <>
              <div style={{ textAlign: "center", marginBottom: 40 }}>
                <div className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium" style={{ borderColor: "color-mix(in oklch, var(--accent) 20%, transparent)", color: "var(--accent)", marginBottom: 12 }}>
                  <Sparkles size={12} /> اختر باقتك
                </div>
                <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>اختر خطة <span style={{ color: "var(--accent)" }}>SmartBot</span></h1>
                <p style={{ color: "var(--muted)", fontSize: 14 }}>جميع الخطط تشمل ردود ذكية وتحليلات أساسية</p>
                <AnnualToggle annual={annual} onChange={setAnnual} />
              </div>

              {/* Plans Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {plans.map((plan, i) => (
                  <div key={plan.id} onClick={() => handleSelectPlan(plan)}>
                    <PlanCard plan={plan} index={i} annual={annual} selected={selectedPlan?.id === plan.id} onSelect={handleSelectPlan} />
                  </div>
                ))}
              </div>
            </>
          )}

          {step === "form" && selectedPlan && (
            <div style={{ maxWidth: 440, margin: "0 auto" }}>
              <button onClick={() => setStep("select")} className="btn btn-outline btn-sm mb-6"><ArrowLeft size={14} /> عودة للباقات</button>
              <div className="glass-card rounded-xl p-8" style={{ border: "1px solid var(--border)" }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{selectedPlan.name_ar}</h2>
                <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 24 }}>{selectedPlan.price === 0 ? "مجاني" : `${annual ? selectedPlan.price * 10 : selectedPlan.price} د.ل/${annual ? "سنوياً" : "شهراً"}`}</p>

                <div className="space-y-4">
                  <div className="fld">
                    <label>الاسم كامل</label>
                    <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="أحمد سالم" />
                  </div>
                  <div className="fld">
                    <label>اسم المستخدم</label>
                    <input value={form.username} onChange={e => setForm({...form, username: e.target.value})} placeholder="ahmed" dir="ltr" style={{ textAlign: "right" }} />
                  </div>
                  <div className="fld">
                    <label>كلمة المرور</label>
                    <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="أدخل كلمة المرور" />
                  </div>
                  <div className="fld">
                    <label>رقم الهاتف</label>
                    <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="0912345678" />
                  </div>
                  <div className="fld">
                    <label>البريد الإلكتروني</label>
                    <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="ahmed@example.com" />
                  </div>
                </div>

                {selectedPlan.price > 0 && (
                  <div className="mt-6 p-4 rounded-sm" style={{ background: "var(--accent-soft)" }}>
                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>طريقة الدفع:</p>
                    <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
                      حول المبلغ إلى المحفظة التالية:
                    </p>
                    <p style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{config.libyana_phone || "0942119637"} — ليبيانا</p>
                    <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      الكود: <code className="code-inline">*122*{config.libyana_phone || "0942119637"}*{annual ? selectedPlan.price * 10 : selectedPlan.price}*1#</code>
                    </p>
                  </div>
                )}

                <button className="btn btn-primary w-full mt-6 justify-center" onClick={handleSubmit}
                  style={{ borderRadius: "var(--radius-lg)", padding: "12px", fontSize: 14, boxShadow: "var(--shadow-glow)" }}>
                  {selectedPlan.price === 0 ? "إنشاء الحساب مجاناً" : "تقديم طلب الدفع"}
                </button>
              </div>
            </div>
          )}

          {step === "payment" && (
            <div style={{ textAlign: "center", maxWidth: 400, margin: "60px auto" }}>
              <div className="glass-card rounded-xl p-8" style={{ border: "1px solid var(--border)" }}>
                <div className="size-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "var(--accent-soft)" }}>
                  <div className="size-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>في انتظار تأكيد الدفع</h2>
                <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.7 }}>
                  تم إرسال طلب الدفع. سيتم إشعار فريق الإدارة للموافقة على اشتراكك.
                </p>
                <div style={{ position: "relative", width: 120, height: 120, margin: "0 auto 16px" }}>
                  <svg className="absolute inset-0" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="6" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round"
                      style={{ strokeDasharray: 251.327, strokeDashoffset: (1 - countdown / 60) * 251.327, transition: "stroke-dashoffset 1s linear" }} />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: "var(--accent)" }}>{countdown}</div>
                </div>
                <p style={{ fontSize: 12, color: "var(--muted)" }}>نقوم بالتحقق من حالة الدفع...</p>
              </div>
            </div>
          )}

          {step === "success" && (
            <div style={{ textAlign: "center", maxWidth: 400, margin: "60px auto" }}>
              <div className="glass-card rounded-xl p-8" style={{ border: "1px solid var(--accent)" }}>
                <div className="size-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "var(--success-soft)" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: "var(--success)" }}>🎉 تم تفعيل اشتراكك!</h2>
                <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 24, lineHeight: 1.7 }}>
                  مرحباً بك في SmartBot! لنبدأ بإعداد بوتك.
                </p>
                <button className="btn btn-primary" onClick={() => onNavigate && onNavigate("dashboard")}
                  style={{ borderRadius: "var(--radius-lg)", padding: "10px 28px", fontSize: 14, boxShadow: "var(--shadow-glow)" }}>
                  اذهب إلى لوحة التحكم
                </button>
              </div>
            </div>
          )}

          {step === "rejected" && (
            <div style={{ textAlign: "center", maxWidth: 400, margin: "60px auto" }}>
              <div className="glass-card rounded-xl p-8" style={{ border: "1px solid var(--danger)" }}>
                <div className="size-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "var(--danger-soft)" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: "var(--danger)" }}>تم رفض الطلب</h2>
                <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 24, lineHeight: 1.7 }}>
                  لم يتم الموافقة على طلب الدفع. يرجى المحاولة مرة أخرى أو التواصل مع الدعم.
                </p>
                <div className="flex gap-3 justify-center">
                  <button className="btn btn-primary" onClick={() => { setStep("form"); setCountdown(60) }}
                    style={{ borderRadius: "var(--radius-lg)", fontSize: 13 }}>إعادة المحاولة</button>
                  <button className="btn btn-outline" onClick={() => onNavigate && onNavigate("landing")}>العودة</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

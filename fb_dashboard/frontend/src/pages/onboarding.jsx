import { useState } from "react"
import { toast } from "sonner"

const steps = [
  { value: 0, label: "الترحيب" },
  { value: 1, label: "الاتصال بفيسبوك" },
  { value: 2, label: "القاعدة الأولى" },
  { value: 3, label: "انتهى" },
]

function StepIndicator({ current }) {
  return (
    <div className="flex-center" style={{ gap: 8, marginBlockEnd: 32 }}>
      {steps.map((s, i) => (
        <div key={s.value} className="flex-center" style={{ gap: 6 }}>
          <div
            className="flex-center"
            style={{
              width: 28, height: 28, borderRadius: "50%", fontSize: 12, fontWeight: 600,
              background: i <= current ? "var(--accent)" : "var(--border)",
              color: i <= current ? "#fff" : "var(--muted)",
              transition: "background .2s",
            }}
          >
            {i + 1}
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: i < current ? 24 : 24, height: 2, background: i < current ? "var(--accent)" : "var(--border)", borderRadius: 1 }} />
          )}
        </div>
      ))}
    </div>
  )
}

function WelcomeStep({ onNext }) {
  return (
    <div className="flex-col" style={{ alignItems: "center", gap: 20, textAlign: "center" }}>
      <div
        className="flex-center"
        style={{
          width: 72, height: 72, borderRadius: 20,
          background: "linear-gradient(135deg, var(--accent), var(--accent-soft))",
          fontSize: 32, fontWeight: 800, color: "#fff",
        }}
      >
        S
      </div>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBlockEnd: 8 }}>مرحباً بك في SmartBot</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, maxWidth: 400 }}>
          منصة أتمتة ذكية لإدارة تفاعلات فيسبوك — ردود تلقائية، جدولة منشورات،
          تحليلات شاملة، وأكثر. لنبدأ بإعداد حسابك خلال دقائق.
        </p>
      </div>
      <button className="btn btn-primary" style={{ fontSize: 14, padding: "10px 32px", boxShadow: "var(--shadow-glow)" }} onClick={onNext}>
        ابدأ
      </button>
    </div>
  )
}

function ConnectFacebookStep({ onNext }) {
  const [pageId, setPageId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [testing, setTesting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showToken, setShowToken] = useState(false)

  const handleSave = async () => {
    if (!pageId.trim() || !accessToken.trim()) {
      toast.error("يرجى إدخال Page ID و Access Token")
      return
    }
    setSaving(true)
    try {
      const r = await fetch("/api/facebook/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: pageId.trim(), access_token: accessToken.trim() }),
      })
      if (!r.ok) throw new Error("فشل الحفظ")
      setConnected(true)
      toast.success("تم حفظ الإعدادات")
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const r = await fetch("/api/facebook/test", { method: "POST" })
      if (!r.ok) throw new Error("فشل الاختبار")
      const data = await r.json()
      if (data.connected) {
        setConnected(true)
        toast.success(`اتصال ناجح! عدد المعجبين: ${data.fan_count}`)
      } else {
        toast.error(data.error || "فشل الاتصال")
      }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBlockEnd: 4 }}>ربط صفحة فيسبوك</h2>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>أدخل بيانات صفحتك لبدء استقبال التفاعلات</p>
      </div>
      <div className="card glass glass-card card-premium card-hover-lift card-inset" style={{ maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <div className="fld mb-8">
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBlockEnd: 4 }}>معرف الصفحة (Page ID)</label>
          <input type="text" className="fld" value={pageId} onChange={e => setPageId(e.target.value)} placeholder="أدخل Page ID" style={{ width: "100%" }} dir="ltr" />
        </div>
        <div className="fld mb-8">
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBlockEnd: 4 }}>رمز الوصول (Access Token)</label>
          <div style={{ display: "flex", gap: 4 }}>
            <input type={showToken ? "text" : "password"} className="fld" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="أدخل Access Token" style={{ flex: 1 }} dir="ltr" />
            <button className="btn btn-outline" style={{ fontSize: 11, padding: "6px 10px" }} onClick={() => setShowToken(!showToken)}>
              {showToken ? "إخفاء" : "إظهار"}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBlockStart: 8 }}>
          <button className="btn btn-primary" style={{ fontSize: 12, flex: 1, boxShadow: "var(--shadow-glow)" }} onClick={handleSave} disabled={saving}>
            {saving ? "..." : "حفظ الإعدادات"}
          </button>
          <button className="btn btn-outline" style={{ fontSize: 12, flex: 1 }} onClick={handleTest} disabled={testing}>
            {testing ? "..." : "اختبار الاتصال"}
          </button>
        </div>
        {connected && (
          <p style={{ fontSize: 12, color: "var(--success)", marginBlockStart: 8, textAlign: "center" }}>
            <span className="status-dot" style={{ background: "var(--success)", display: "inline-block", marginInlineEnd: 4 }} />
            تم الاتصال بنجاح
          </p>
        )}
      </div>
      <button className="btn btn-primary" style={{ fontSize: 13, alignSelf: "center", padding: "8px 28px", opacity: connected ? 1 : 0.5, boxShadow: "var(--shadow-glow)" }} disabled={!connected} onClick={onNext}>
        التالي
      </button>
    </div>
  )
}

function FirstRuleStep({ onNext }) {
  const [keyword, setKeyword] = useState("")
  const [reply, setReply] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!keyword.trim() || !reply.trim()) {
      toast.error("يرجى إدخال الكلمة المفتاحية ونص الرد")
      return
    }
    setSaving(true)
    const fd = new FormData()
    fd.append("name", `قاعدة "${keyword}"`)
    fd.append("keywords", keyword.trim())
    fd.append("reply_template", reply.trim())
    fd.append("description", "قاعدة ترحيبية من معرّف الإعداد")
    fd.append("bot_type", "reply")
    try {
      const r = await fetch("/api/rules", { method: "POST", body: fd })
      if (!r.ok) throw new Error("فشل الحفظ")
      toast.success("تم إنشاء القاعدة بنجاح")
      onNext()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <div style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBlockEnd: 4 }}>إنشاء أول قاعدة رد تلقائي</h2>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>حدد كلمة مفتاحية ونص الرد التلقائي</p>
      </div>
      <div className="card glass glass-card card-premium card-hover-lift card-inset" style={{ maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <div className="fld mb-8">
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBlockEnd: 4 }}>الكلمة المفتاحية</label>
          <input type="text" className="fld" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="مثال: سعر, مرحبا, تواصل" style={{ width: "100%" }} />
        </div>
        <div className="fld mb-8">
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBlockEnd: 4 }}>نص الرد</label>
          <textarea className="fld" rows={4} value={reply} onChange={e => setReply(e.target.value)} placeholder="اكتب نص الرد التلقائي هنا..." style={{ width: "100%", resize: "vertical" }} />
        </div>
        <button className="btn btn-primary" style={{ fontSize: 13, width: "100%", boxShadow: "var(--shadow-glow)" }} onClick={handleSave} disabled={saving}>
          {saving ? "..." : "حفظ القاعدة"}
        </button>
      </div>
    </div>
  )
}

function DoneStep({ onComplete }) {
  return (
    <div className="flex-col" style={{ alignItems: "center", gap: 20, textAlign: "center" }}>
      <div
        className="flex-center"
        style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "var(--success-soft)",
          fontSize: 36,
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBlockEnd: 8 }}>كل شيء جاهز!</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, maxWidth: 400 }}>
          تم توصيل فيسبوك وإنشاء أول قاعدة رد تلقائي. يمكنك الآن التوجه إلى لوحة
          البيانات لمراقبة التفاعلات وإدارة الإعدادات المتقدمة.
        </p>
      </div>
      <button className="btn btn-primary" style={{ fontSize: 14, padding: "10px 32px", boxShadow: "var(--shadow-glow)" }} onClick={onComplete}>
        الذهاب إلى لوحة البيانات
      </button>
    </div>
  )
}

export function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0)

  return (
    <section className="page active" dir="rtl" style={{ position: "relative", animation: "pageIn 0.35s var(--ease)" }}>
      <div className="mesh-bg" />
      <div className="page-header reveal-blur" style={{ textAlign: "center" }}>
        <h1 className="gradient-text">إعداد SmartBot</h1>
        <p>تجربة الإعداد السريع — دقائق قليلة وتبدأ</p>
      </div>

      <StepIndicator current={step} />

      <div className="card glass glass-card card-premium card-hover-lift" style={{ maxWidth: 520, margin: "0 auto", padding: 32 }}>
        {step === 0 && <WelcomeStep onNext={() => setStep(1)} />}
        {step === 1 && <ConnectFacebookStep onNext={() => setStep(2)} />}
        {step === 2 && <FirstRuleStep onNext={() => setStep(3)} />}
        {step === 3 && <DoneStep onComplete={onComplete} />}
      </div>

      <div className="mobile-nav-spacer" />
    </section>
  )
}

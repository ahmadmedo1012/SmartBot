import { useState, useEffect } from "react"

export function Demo() {
  useEffect(() => { document.title = "طلب تجربة | SmartBot" }, [])

  const [form, setForm] = useState({ name: "", email: "", page_url: "", message: "" })
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim()) return
    setSending(true)
    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      setDone(true)
    } catch (_) { /* ponytail: fire-and-forget, user retries on failure */ }
    setSending(false)
  }

  if (done) {
    return (
      <section className="page active" dir="rtl" data-od-id="page-demo">
        <div className="mesh-bg"></div>
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="size-16 mx-auto mb-6 rounded-full bg-success/20 flex items-center justify-center">
              <svg className="size-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
            </div>
            <h1 className="text-2xl font-bold mb-3">تم إرسال طلبك</h1>
            <p className="text-muted-foreground">سنتواصل معك قريباً لتنسيق موعد التجربة</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="page active" dir="rtl" data-od-id="page-demo">
      <div className="mesh-bg"></div>
      <div className="min-h-screen flex items-center justify-center px-4 py-20">
        <div className="w-full max-w-lg">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold mb-3">طلب تجربة البوت</h1>
            <p className="text-muted-foreground">املأ النموذج وسنخصص لك تجربة كاملة</p>
          </div>
          <form onSubmit={handleSubmit} className="card glass p-8 space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5">الاسم</label>
              <input name="name" value={form.name} onChange={handleChange} required
                className="w-full px-4 py-2.5 rounded-lg bg-black/20 border border-border/40 focus:border-accent outline-none transition-colors"
                placeholder="اسمك الكامل" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">البريد الإلكتروني</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} required
                className="w-full px-4 py-2.5 rounded-lg bg-black/20 border border-border/40 focus:border-accent outline-none transition-colors"
                placeholder="your@email.com" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">رابط الصفحة</label>
              <input name="page_url" value={form.page_url} onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-lg bg-black/20 border border-border/40 focus:border-accent outline-none transition-colors"
                placeholder="https://facebook.com/..." />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">ملاحظاتك</label>
              <textarea name="message" value={form.message} onChange={handleChange} rows={4}
                className="w-full px-4 py-2.5 rounded-lg bg-black/20 border border-border/40 focus:border-accent outline-none transition-colors resize-none"
                placeholder="أي تفاصيل إضافية..." />
            </div>
            <button type="submit" disabled={sending}
              className="w-full py-3 rounded-lg font-bold bg-accent text-accent-foreground hover:brightness-110 transition-all disabled:opacity-50">
              {sending ? "جاري الإرسال..." : "إرسال الطلب"}
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}

import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchBalance, topupBalance, confirmPayment, fetchPaymentHistory, fetchMe } from "@/lib/api"
import { toast } from "sonner"

const QUICK_AMOUNTS = [50, 100, 250]
const PROVIDERS = [
  { value: "liyana", label: "ليبيانا" },
  { value: "madar", label: "مدار" },
]
const PLANS = [
  { key: "free", label: "مجاني", price: 0, features: ["100 رد/يوم", "بوت أساسي", "دعم عبر الواتساب"] },
  { key: "basic", label: "أساسي", price: 49, features: ["500 رد/يوم", "بوت متقدم", "تقارير أسبوعية", "دعم فوري"] },
  { key: "pro", label: "احترافي", price: 129, features: ["غير محدود", "بوت ذكي + AI", "تقارير PDF", "أولويات الدعم", "فريق متعدد"] },
]

export function Billing() {
  const qc = useQueryClient()
  const { data: bal, isLoading: balLoading } = useQuery({ queryKey: ["balance"], queryFn: fetchBalance })
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: fetchMe })
  const { data: history } = useQuery({ queryKey: ["payment-history"], queryFn: fetchPaymentHistory })

  const [amount, setAmount] = useState(0)
  const [provider, setProvider] = useState("liyana")
  const [phone, setPhone] = useState("")
  const [paymentResult, setPaymentResult] = useState(null)
  const [confirmId, setConfirmId] = useState("")
  const [confirmRef, setConfirmRef] = useState("")

  useEffect(() => { document.title = "الفواتير | SmartBot" }, [])

  const topupMut = useMutation({
    mutationFn: () => topupBalance(amount, provider, phone),
    onSuccess: (res) => {
      setPaymentResult(res)
      toast.success("تم إنشاء طلب الدفع")
    },
    onError: () => toast.error("فشل إنشاء طلب الدفع"),
  })

  const confirmMut = useMutation({
    mutationFn: () => confirmPayment(confirmId, confirmRef),
    onSuccess: (res) => {
      toast.success(`تم تأكيد الدفع! الرصيد: ${res.balance} د.ل`)
      setConfirmId(""); setConfirmRef(""); setPaymentResult(null)
      qc.invalidateQueries({ queryKey: ["balance"] })
      qc.invalidateQueries({ queryKey: ["payment-history"] })
    },
    onError: () => toast.error("فشل تأكيد الدفع"),
  })

  const currentPlan = user?.plan || "free"

  return (
    <section className="page active" dir="rtl" style={{animation:"pageIn 0.35s var(--ease)"}}>
      <div className="page-header reveal-blur">
        <h1>الفواتير والاشتراك</h1>
        <p>إدارة خطتك واشتراكاتك</p>
      </div>

      {/* Balance Card */}
      <div className="stat-card glass" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div className="stat-label">الرصيد الحالي</div>
          {balLoading ? (
            <div className="skeleton" style={{ width: 120, height: 32, borderRadius: 6 }} />
          ) : (
            <div className="stat-value" style={{ fontSize: 32, color: "var(--accent)" }}>
              {bal?.balance?.toLocaleString() || 0} <span style={{ fontSize: 14, fontWeight: 400, color: "var(--muted)" }}>د.ل</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span className="badge badge-s" style={{ fontSize: 12 }}>الرصيد بالدينار الليبي</span>
        </div>
      </div>

      {/* Topup Section */}
      <div className="row-2" style={{ marginBottom: 24 }}>
        <div className="card glass">
          <div className="cc-header"><div className="cc-title">شحن الرصيد</div></div>

          <p className="text-muted-md mb-12">اختر المبلغ:</p>
          <div className="qactions" style={{ marginBottom: 16 }}>
            {QUICK_AMOUNTS.map((a) => (
              <button key={a} className={`btn ${amount === a ? "btn-primary" : "btn-outline"}`} style={amount === a ? {boxShadow:"var(--shadow-glow)"} : undefined} onClick={() => { setAmount(a); setPaymentResult(null) }}>
                {a} د.ل
              </button>
            ))}
          </div>

          {amount > 0 && !paymentResult && (
            <div className="fld" style={{ gap: 12 }}>
              <div className="fld">
                <label>مزود الدفع</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  style={{ width: "100%", maxWidth: 360, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", font: "inherit", fontSize: 13, background: "var(--bg)" }}
                >
                  {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="fld">
                <label>رقم الهاتف</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912345678" />
              </div>
              <button className="btn btn-primary" disabled={!phone || phone.length < 7 || topupMut.isPending} onClick={topupMut.mutate} style={{ alignSelf: "flex-start", boxShadow: "var(--shadow-glow)" }}>
                {topupMut.isPending ? "جاري..." : "طلب الدفع"}
              </button>
            </div>
          )}

          {paymentResult && (
            <div className="card-inset" style={{ background: "var(--accent-soft)", borderRadius: "var(--radius-md)", padding: 16 }}>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>تم إنشاء طلب الدفع</p>
              <p className="text-muted-md" style={{ lineHeight: 1.7 }}>{paymentResult.instructions}</p>
              <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
              <div className="fld" style={{ gap: 8 }}>
                <div className="fld">
                  <label>معرف الدفع</label>
                  <input value={paymentResult.payment_id} readOnly style={{ background: "var(--skeleton)", fontSize: 12 }} />
                </div>
                <div className="fld">
                  <label>رقم الحوالة</label>
                  <input value={confirmRef} onChange={(e) => setConfirmRef(e.target.value)} placeholder="أدخل رقم الحوالة" />
                </div>
                <button className="btn btn-primary btn-sm" disabled={!confirmRef || confirmMut.isPending} onClick={() => confirmMut.mutate()} style={{boxShadow:"var(--shadow-glow)"}}>
                  {confirmMut.isPending ? "جاري..." : "تأكيد الدفع"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Plan Info */}
        <div className="card glass">
          <div className="cc-header"><div className="cc-title">الاشتراك الحالي</div></div>
          <div style={{ marginBottom: 16 }}>
            <span className="badge badge-a" style={{ fontSize: 13, padding: "4px 14px" }}>
              {PLANS.find(p => p.key === currentPlan)?.label || "مجاني"}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PLANS.filter(p => p.key !== currentPlan).map((plan) => (
              <div key={plan.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "var(--radius-sm)", background: "color-mix(in oklch, var(--border) 20%, transparent)" }}>
                <div>
                  <strong style={{ fontSize: 13 }}>{plan.label}</strong>
                  <span style={{ fontSize: 12, color: "var(--muted)", marginInlineStart: 8 }}>{plan.price} د.ل/شهر</span>
                </div>
                <button className="btn btn-outline btn-sm">ترقية</button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {PLANS.find(p => p.key === currentPlan)?.features.map((f, i) => (
              <div key={i} className="flex-center-gap8" style={{ fontSize: 12, color: "var(--muted)" }}>
                <span style={{ color: "var(--success)" }}>✓</span> {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment History */}
      <div className="card glass" style={{ marginBottom: 24 }}>
        <div className="cc-header"><div className="cc-title">سجل الدفعات</div></div>
        {!history?.length ? (
          <div className="empty-state" role="status"><p>لا توجد دفعات سابقة</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المعرف</th>
                  <th>المبلغ</th>
                  <th>المزود</th>
                  <th>رقم الهاتف</th>
                  <th>رقم الحوالة</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.payment_id} style={{transition:"background .15s var(--ease), border-color .15s var(--ease)"}}>
                    <td data-label="المعرف"><code className="code-inline">{p.payment_id}</code></td>
                    <td data-label="المبلغ" style={{ fontWeight: 600 }}>{p.amount} د.ل</td>
                    <td data-label="المزود">{p.provider === "liyana" ? "ليبيانا" : "مدار"}</td>
                    <td data-label="رقم الهاتف" dir="ltr" style={{ textAlign: "right" }}>{p.phone}</td>
                    <td data-label="رقم الحوالة">{p.reference || "—"}</td>
                    <td data-label="الحالة">
                      <span className={`badge ${p.status === "confirmed" ? "badge-s" : "badge-w"}`}>
                        {p.status === "confirmed" ? "مؤكد" : "قيد الانتظار"}
                      </span>
                    </td>
                    <td data-label="التاريخ" style={{ fontSize: 12, color: "var(--muted)" }}>{new Date(p.created_at).toLocaleDateString("ar-LY")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

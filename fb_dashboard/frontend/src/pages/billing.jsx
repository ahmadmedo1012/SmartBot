import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchPlans, fetchSubscription, createCheckoutSession, fetchPaymentHistory } from "@/lib/api"

function PageLoader() {
  return (
    <div className="min-h-[200px] flex flex-col items-center justify-center gap-4 p-8">
      <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function PlanCard({ plan, selecting, onSelect, isCurrent }) {
  return (
    <div
      className="glass rounded-2xl p-6 flex flex-col relative"
      style={{
        border: isCurrent ? "1.5px solid var(--accent)" : "1px solid var(--border)",
        transition: "all .2s",
      }}
    >
      {isCurrent && (
        <span
          className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-semibold"
          style={{ background: "var(--accent)", color: "#fff", whiteSpace: "nowrap" }}
        >
          خطتك الحالية
        </span>
      )}

      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{plan.name}</h3>
      <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>{plan.description}</p>

      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: "var(--fg)" }}>
          {plan.price_monthly === 0 ? "مجاني" : `${(plan.price_monthly / 100).toFixed(0)} د.ل`}
        </span>
        {plan.price_monthly > 0 && (
          <span style={{ fontSize: 12, color: "var(--muted)", marginRight: 6 }}>/ الشهر</span>
        )}
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px 0", flex: 1 }}>
        {(plan.features || []).map((f, i) => (
          <li
            key={i}
            style={{
              fontSize: 13, padding: "6px 0",
              color: "var(--fg)",
              display: "flex", alignItems: "center", gap: 8,
              borderBottom: i < (plan.features || []).length - 1 ? "1px solid var(--border)" : "none",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            {f}
          </li>
        ))}
      </ul>

      {!isCurrent && (
        <button
          onClick={() => onSelect(plan.id)}
          className="btn"
          style={{
            width: "100%", padding: "10px 0", borderRadius: 10, fontSize: 13,
            background: plan.price_monthly === 0 ? "var(--accent)" : "color-mix(in oklch, var(--accent) 15%, transparent)",
            color: plan.price_monthly === 0 ? "#fff" : "var(--accent)",
            fontWeight: 600, border: "none", cursor: "pointer",
            opacity: selecting === plan.id ? 0.6 : 1,
          }}
          disabled={selecting === plan.id}
        >
          {selecting === plan.id ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ margin: "0 auto" }} />
          ) : plan.price_monthly === 0 ? "البدء مجاناً" : "اختيار الخطة"}
        </button>
      )}
    </div>
  )
}

export function Billing() {
  useEffect(() => { document.title = "الفواتير والاشتراك | SmartBot" }, [])
  const [selecting, setSelecting] = useState(null)

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: fetchPlans,
  })

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: fetchSubscription,
  })

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: fetchPaymentHistory,
  })

  const handleSelectPlan = async (planId) => {
    setSelecting(planId)
    try {
      const result = await createCheckoutSession(planId)
      if (result.url) {
        window.location.href = result.url
      } else if (result.mock) {
        alert(result.message || "تم تفعيل الاشتراك بنجاح ✅")
        window.location.reload()
      }
    } catch (err) {
      alert("فشل تفعيل الاشتراك: " + err.message)
    } finally {
      setSelecting(null)
    }
  }

  if (plansLoading || subLoading) return <PageLoader />

  const currentPlanId = subscription?.plan?.id

  return (
    <section className="page active" dir="rtl">
      <div className="mesh-bg"></div>
      <div className="page-header">
        <h1>الفواتير والاشتراك</h1>
        <p>خطط الأسعار والتحكم بالاشتراك</p>
      </div>

      {/* Current Subscription Status */}
      <div
        className="glass rounded-2xl p-5 mb-6"
        style={{
          border: "1px solid color-mix(in oklch, var(--accent) 20%, transparent)",
          background: "linear-gradient(135deg, color-mix(in oklch, var(--accent) 5%, var(--bg)), var(--bg))",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>حالة الاشتراك</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {subscription?.subscription_status === "active" || subscription?.subscription_status === "trial" ? (
                <span style={{ color: "var(--success)" }}>✅ نشط</span>
              ) : subscription?.subscription_status === "past_due" ? (
                <span style={{ color: "var(--danger)" }}>⚠️ متأخر</span>
              ) : (
                <span style={{ color: "var(--muted)" }}>غير نشط</span>
              )}
              {" — "}
              {subscription?.plan?.name || "الخطة المجانية"}
            </div>
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>الشركة</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{subscription?.company_name || "—"}</div>
            {subscription?.ends_at && (
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                تاريخ الانتهاء: {new Date(subscription.ends_at).toLocaleDateString("ar-LY")}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Plans Grid */}
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>الخطط المتاحة</h2>
      {plans && plans.length > 0 ? (
        <div
          className="stats-grid stagger-children"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            gap: 16, marginBottom: 32,
          }}
        >
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              selecting={selecting}
              isCurrent={plan.id === currentPlanId}
              onSelect={handleSelectPlan}
            />
          ))}
        </div>
      ) : (
        <div className="glass rounded-2xl p-8 text-center mb-8">
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            لم يتم إعداد الخطط بعد. يرجى المحاولة لاحقاً.
          </p>
        </div>
      )}

      {/* Payment History */}
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>سجل المدفوعات</h2>
      <div className="card glass table-wrap">
        {paymentsLoading ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>جاري التحميل...</div>
        ) : payments && payments.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>المبلغ</th>
                <th>الحالة</th>
                <th>الإيصال</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td data-label="التاريخ">{p.created_at ? new Date(p.created_at).toLocaleDateString("ar-LY") : "—"}</td>
                  <td data-label="المبلغ">{(p.amount / 100).toFixed(0)} د.ل</td>
                  <td data-label="الحالة">
                    <span style={{
                      color: p.status === "completed" ? "var(--success)" : p.status === "failed" ? "var(--danger)" : "var(--muted)",
                      fontWeight: 600, fontSize: 12,
                    }}>
                      {p.status === "completed" ? "مكتمل" : p.status === "pending" ? "قيد الانتظار" : p.status === "failed" ? "فشل" : p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state" role="status">
            <p>لا توجد مدفوعات مسجلة بعد</p>
          </div>
        )}
      </div>
    </section>
  )
}

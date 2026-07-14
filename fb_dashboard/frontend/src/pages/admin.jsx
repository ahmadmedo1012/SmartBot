import { useState, useEffect } from "react"
import { toast } from "sonner"
import { CheckCircle, XCircle, RefreshCw } from "lucide-react"

const STATUS_FILTERS = [
  { key: "pending", label: "قيد الانتظار", color: "badge-w" },
  { key: "verified", label: "مؤكد", color: "badge-s" },
  { key: "cancelled", label: "ملغي", color: "badge-d" },
  { key: "all", label: "الكل", color: "badge-i" },
]

export function Admin({ role }) {
  const [payments, setPayments] = useState([])
  const [filter, setFilter] = useState("pending")
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState(null)

  const fetchPayments = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/subscriptions?status=${filter}`, { credentials: "include" })
      if (r.ok) setPayments(await r.json())
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchPayments() }, [filter])

  const handleAction = async (id, status) => {
    setActionId(id)
    try {
      const r = await fetch("/api/admin/subscriptions", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      })
      if (!r.ok) { toast.error("فشل"); return }
      toast.success(status === "verified" ? "✅ تم تأكيد الاشتراك" : "❌ تم رفض الطلب")
      fetchPayments()
    } catch { toast.error("خطأ في الاتصال") }
    setActionId(null)
  }

  const statusBadge = (s) => {
    if (s === "pending") return <span className="badge badge-w">قيد الانتظار</span>
    if (s === "verified") return <span className="badge badge-s">مؤكد</span>
    return <span className="badge badge-d">ملغي</span>
  }

  if (!role || role !== "admin") return (
    <section className="page active" dir="rtl" style={{ animation: "pageIn 0.35s var(--ease)" }}>
      <div className="mesh-bg" />
      <div className="page-header reveal-blur" style={{ textAlign: "center" }}>
        <h1>غير مصرح</h1>
        <p>هذه الصفحة مخصصة للمشرفين فقط</p>
      </div>
    </section>
  )

  return (
    <section className="page active" dir="rtl" style={{ animation: "pageIn 0.35s var(--ease)" }}>
      <div className="mesh-bg" />
      <div className="page-header reveal-blur">
        <h1>إدارة الاشتراكات</h1>
        <p>مراجعة طلبات الدفع والموافقة عليها</p>
      </div>

      {/* Filters */}
      <div className="qactions" style={{ marginBottom: 16 }}>
        {STATUS_FILTERS.map(f => (
          <button key={f.key} className={`btn btn-sm ${filter === f.key ? "btn-primary" : "btn-outline"}`}
            onClick={() => setFilter(f.key)} style={{ fontSize: 12 }}>
            {f.label}
          </button>
        ))}
        <button className="btn btn-sm btn-outline" onClick={fetchPayments} style={{ fontSize: 12 }}><RefreshCw size={14} /></button>
      </div>

      {/* Table */}
      <div className="card glass glass-card card-premium" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center" }}><div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : !payments.length ? (
          <div className="empty-state" style={{ padding: 48 }}><p>لا توجد طلبات {filter === "pending" ? "معلقة" : filter}</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>المستخدم</th><th>الباقة</th><th>المبلغ</th><th>المزود</th><th>رقم الهاتف</th><th>الحالة</th><th>التاريخ</th><th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td><code className="code-inline">{p.id}</code></td>
                    <td>{p.metadata?.username || p.user_id}</td>
                    <td>{p.plan_name}</td>
                    <td style={{ fontWeight: 600 }}>{p.amount} د.ل</td>
                    <td>{p.provider === "libyana" ? "ليبيانا" : "مدار"}</td>
                    <td dir="ltr" style={{ textAlign: "right" }}>{p.phone}</td>
                    <td>{statusBadge(p.status)}</td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{p.created_at ? new Date(p.created_at).toLocaleDateString("ar-LY") : "—"}</td>
                    <td>
                      {p.status === "pending" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-sm" style={{ background: "var(--success)", color: "#fff", fontSize: 11, padding: "4px 10px" }}
                            onClick={() => handleAction(p.id, "verified")} disabled={actionId === p.id}>
                            <CheckCircle size={14} />
                          </button>
                          <button className="btn btn-sm" style={{ background: "var(--danger)", color: "#fff", fontSize: 11, padding: "4px 10px" }}
                            onClick={() => handleAction(p.id, "cancelled")} disabled={actionId === p.id}>
                            <XCircle size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mobile-nav-spacer" />
    </section>
  )
}

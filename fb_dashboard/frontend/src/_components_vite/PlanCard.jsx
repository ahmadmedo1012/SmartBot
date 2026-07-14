import { Sparkles, Crown, Star, Building2 } from "lucide-react"

const PLAN_ICONS = [Sparkles, Star, Crown, Crown, Building2]
const PLAN_BADGES = ["", "الأكثر شعبية", "الأفضل قيمة", "", "للشركات الكبرى"]

export function PlanCard({ plan, index, annual, onSelect, selected }) {
  const Icon = PLAN_ICONS[index] || Sparkles
  const isPopular = index === 1
  const showPrice = plan.price === 0 ? "0" : annual ? String(plan.price * 10) : String(plan.price)
  const showLabel = plan.price === 0 ? "" : annual ? "د.ل/سنوياً" : "د.ل/شهر"

  return (
    <div className={`rounded-sm p-5 flex flex-col relative ${onSelect ? "cursor-pointer" : ""}`}
      style={{
        background: isPopular ? "linear-gradient(135deg, var(--surface), oklch(0.12 0.005 30))" : "var(--surface)",
        border: selected || isPopular ? "1px solid var(--accent)" : "1px solid var(--border)",
        boxShadow: selected || isPopular ? "var(--shadow-glow)" : "var(--shadow-sm)",
        transition: "all 0.2s",
      }}
      onClick={() => onSelect && onSelect(plan)}>
      {PLAN_BADGES[index] && (
        <div className="text-center mb-2">
          <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
            {PLAN_BADGES[index]}
          </span>
        </div>
      )}
      <div className="text-center mb-3">
        <div className="flex justify-center mb-2">
          <div className="size-10 rounded-sm flex items-center justify-center" style={{ background: "color-mix(in oklch, var(--accent) 12%, transparent)" }}>
            <Icon className="size-5" style={{ color: "var(--accent)" }} />
          </div>
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 700 }}>{plan.name_ar || plan.name}</h3>
        <div className="mt-2">
          <span style={{ fontSize: 28, fontWeight: 800, color: "var(--accent)" }}>{showPrice}</span>
          {showLabel && <span className="text-xs mr-1" style={{ color: "var(--muted)" }}>{showLabel}</span>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 mb-3 p-2 rounded-sm" style={{ background: "var(--muted-bg)" }}>
        <div className="text-center">
          <div className="text-xs font-bold" style={{ color: "var(--accent)" }}>{plan.max_replies >= 999999 ? "∞" : plan.max_replies}</div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>الردود</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-bold" style={{ color: "var(--accent)" }}>{plan.max_pages >= 999 ? "∞" : plan.max_pages}</div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>الصفحات</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-bold" style={{ color: "var(--accent)" }}>{plan.max_rules || "—"}</div>
          <div className="text-[10px]" style={{ color: "var(--muted)" }}>قواعد</div>
        </div>
      </div>
      <div className="flex-1 space-y-1.5 mb-4">
        {(plan.features || []).slice(0, 4).map((f, j) => (
          <div key={j} className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            {typeof f === "string" ? f.length > 30 ? f.slice(0, 28) + "…" : f : f}
          </div>
        ))}
      </div>
      <button className={`btn w-full py-2 ${isPopular ? "btn-primary" : "btn-outline"}`}
        style={{ borderRadius: "var(--radius-lg)", fontSize: 12, fontWeight: 700 }}>
        {plan.price === 0 ? "ابدأ مجاناً" : onSelect ? "اختيار" : "اشتراك الآن"}
      </button>
    </div>
  )
}

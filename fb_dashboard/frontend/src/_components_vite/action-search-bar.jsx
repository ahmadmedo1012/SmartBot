import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, LayoutDashboard, MessageCircle, MessageSquare, FileText, Calendar, BarChart3, Users, UserPlus, Megaphone, TrendingUp, FileBarChart, Globe, Reply, Activity, Bell, Wrench, CreditCard, Headphones, Settings, Send } from "lucide-react"

const iconMap = {
  dashboard: LayoutDashboard, messages: MessageCircle, comments: MessageSquare,
  posts: FileText, scheduled: Calendar, analytics: BarChart3, audience: Users,
  leads: UserPlus, ads: Megaphone, marketing: TrendingUp, reports: FileBarChart,
  pages: Globe, team: Users, autoreply: Reply, activity: Activity,
  notifications: Bell, tools: Wrench, billing: CreditCard, support: Headphones,
  settings: Settings, broadcast: Send,
}

const pages = [
  { id: "dashboard", label: "لوحة البيانات", icon: "dashboard", keywords: ["رئيسية", "الصفحة الرئيسية"] },
  { id: "messages", label: "الرسائل", icon: "messages", keywords: ["محادثات", "صندوق وارد"] },
  { id: "comments", label: "التعليقات", icon: "comments", keywords: ["ردود", "تفاعل"] },
  { id: "posts", label: "المنشورات", icon: "posts", keywords: ["نشر", "محتوى"] },
  { id: "scheduled", label: "المجدول", icon: "scheduled", keywords: ["مواعيد", "جدولة"] },
  { id: "analytics", label: "التحليلات", icon: "analytics", keywords: ["إحصائيات", "تقارير"] },
  { id: "audience", label: "الجمهور", icon: "audience", keywords: ["متابعون", "فئات"] },
  { id: "leads", label: "العملاء المتوقعون", icon: "leads", keywords: ["عملاء"] },
  { id: "ads", label: "الإعلانات", icon: "ads", keywords: ["إعلان", "ترويج"] },
  { id: "broadcast", label: "البث الجماعي", icon: "broadcast", keywords: ["إرسال", "بث"] },
  { id: "marketing", label: "التسويق", icon: "marketing", keywords: ["تسويق", "حملات"] },
  { id: "reports", label: "التقارير", icon: "reports", keywords: ["تقارير"] },
  { id: "pages", label: "الصفحات", icon: "pages", keywords: ["صفحات فيسبوك"] },
  { id: "team", label: "الفريق", icon: "team", keywords: ["أعضاء", "مستخدمون"] },
  { id: "calendar", label: "تقويم المحتوى", icon: "scheduled", keywords: ["تقويم"] },
  { id: "autoreply", label: "الردود التلقائية", icon: "autoreply", keywords: ["رد تلقائي"] },
  { id: "activity", label: "سجل النشاطات", icon: "activity", keywords: ["نشاط", "سجل"] },
  { id: "notifications", label: "الإشعارات", icon: "notifications", keywords: ["تنبيهات"] },
  { id: "tools", label: "الأدوات", icon: "tools", keywords: ["أدوات"] },
  { id: "billing", label: "الفواتير", icon: "billing", keywords: ["دفع", "اشتراك"] },
  { id: "support", label: "الدعم", icon: "support", keywords: ["مساعدة", "تواصل"] },
  { id: "settings", label: "الإعدادات", icon: "settings", keywords: ["ضبط", "تعديل"] },
]

export function ActionSearchBar({ onNavigate, currentPage }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const filtered = query
    ? pages.filter(p =>
        p.label.includes(query) ||
        p.keywords.some(k => k.includes(query))
      )
    : pages

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault(); setOpen(o => !o)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  useEffect(() => {
    if (open) { setQuery(""); setSelectedIdx(0); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  const select = useCallback((id) => {
    setOpen(false); onNavigate && onNavigate(id)
  }, [onNavigate])

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === "Enter") { e.preventDefault(); filtered[selectedIdx] && select(filtered[selectedIdx].id) }
    else if (e.key === "Escape") { setOpen(false) }
  }

  useEffect(() => {
    const selected = listRef.current?.querySelector("[data-selected=true]")
    selected?.scrollIntoView({ block: "nearest" })
  }, [selectedIdx])

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 8, height: 36,
          borderRadius: 6, border: "1px solid color-mix(in oklch, var(--border) 30%, transparent)",
          background: "color-mix(in oklch, var(--surface) 40%, transparent)",
          padding: "0 12px", fontSize: 13, color: "color-mix(in oklch, var(--muted) 60%, transparent)",
          cursor: "pointer", transition: "border-color .15s, color .15s, background .15s",
        }}
        className="hidden sm:flex"
        aria-label="بحث سريع (⌘K)"
        onMouseEnter={e => { e.currentTarget.style.borderColor = "color-mix(in oklch, var(--accent) 30%, transparent)"; e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.background = "color-mix(in oklch, var(--surface) 60%, transparent)" }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "color-mix(in oklch, var(--border) 30%, transparent)"; e.currentTarget.style.color = "color-mix(in oklch, var(--muted) 60%, transparent)"; e.currentTarget.style.background = "color-mix(in oklch, var(--surface) 40%, transparent)" }}
      >
        <Search size={16} strokeWidth={1.8} />
        <span style={{ flex: 1, textAlign: "right" }}>بحث سريع...</span>
        <kbd style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "color-mix(in oklch, var(--border) 40%, transparent)", color: "var(--muted)", lineHeight: 1.5 }}>⌘K</kbd>
      </button>

      {/* Modal overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -20 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              onClick={e => e.stopPropagation()}
              dir="rtl"
              style={{
                position: "relative", zIndex: 51, width: "100%", maxWidth: 480,
                margin: "80px auto 0", borderRadius: 12,
                border: "1px solid color-mix(in oklch, var(--border) 40%, transparent)",
                background: "color-mix(in oklch, var(--bg) 95%, transparent)",
                boxShadow: "0 25px 80px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.05)",
                backdropFilter: "blur(24px)", overflow: "hidden",
              }}
            >
              {/* Search input */}
              <div style={{ position: "relative", borderBlockEnd: "1px solid color-mix(in oklch, var(--border) 30%, transparent)" }}>
                <Search size={18} strokeWidth={1.8} style={{ position: "absolute", insetInlineStart: 16, top: "50%", transform: "translateY(-50%)", color: "color-mix(in oklch, var(--muted) 40%, transparent)", pointerEvents: "none" }} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => { setQuery(e.target.value); setSelectedIdx(0) }}
                  onKeyDown={handleKeyDown}
                  placeholder="ابحث عن صفحة..."
                  style={{ width: "100%", height: 48, background: "transparent", padding: "0 48px 0 16px", fontSize: 14, border: 0, outline: "none", color: "var(--fg)" }}
                />
              </div>

              {/* Results */}
              <div style={{ maxHeight: 288, overflowY: "auto", padding: 8, scrollbarWidth: "thin" }} ref={listRef} role="listbox">
                {filtered.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0", color: "var(--muted)" }}>
                    <Search size={32} strokeWidth={1.5} style={{ opacity: 0.3 }} />
                    <p style={{ fontSize: 13, fontWeight: 600, marginBlockStart: 8 }}>لا توجد نتائج</p>
                    <p style={{ fontSize: 12, opacity: 0.6 }}>جرب كلمات بحث أخرى</p>
                  </div>
                ) : (
                  filtered.map((page, i) => {
                    const Icon = iconMap[page.icon]
                    const isSelected = i === selectedIdx
                    const isCurrent = page.id === currentPage
                    return (
                      <button
                        key={page.id}
                        data-selected={isSelected}
                        onClick={() => select(page.id)}
                        role="option"
                        aria-selected={isSelected}
                        style={{
                          display: "flex", alignItems: "center", gap: 12, width: "100%",
                          padding: "8px 12px", borderRadius: 8, fontSize: 14, textAlign: "right",
                          background: isSelected ? "linear-gradient(to left, color-mix(in oklch, var(--accent) 15%, transparent), transparent)" : "transparent",
                          color: isSelected ? "var(--accent)" : "color-mix(in oklch, var(--fg) 80%, transparent)",
                          border: 0, cursor: "pointer", position: "relative", transition: "background .12s",
                        }}
                        onMouseEnter={() => setSelectedIdx(i)}
                      >
                        <span style={{
                          width: 32, height: 32, borderRadius: 8, display: "grid", placeItems: "center", flexShrink: 0,
                          background: isSelected ? "color-mix(in oklch, var(--accent) 20%, transparent)" : "color-mix(in oklch, var(--border) 30%, transparent)",
                          color: isSelected ? "var(--accent)" : "var(--muted)",
                          transition: "background .12s",
                        }}>
                          {Icon && <Icon size={16} strokeWidth={1.8} />}
                        </span>
                        <span style={{ flex: 1, textAlign: "right" }}>{page.label}</span>
                        {isCurrent && <span style={{ fontSize: 10, color: "color-mix(in oklch, var(--muted) 40%, transparent)" }}>الحالية</span>}
                      </button>
                    )
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

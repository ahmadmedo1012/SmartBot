import { useState, useRef, useEffect } from "react"
import { useNotifications } from "@/hooks/use-notifications"

const ICON_MAP = {
  MessageSquareReply: "reply",
  Play: "play", Square: "square", AlertCircle: "alert-circle",
  AlertTriangle: "alert-triangle", Info: "info",
  CheckCircle: "check-circle", Webhook: "webhook",
  Bell: "alert-triangle",
}

function NtfIcon({ iconName, color }) {
  const key = ICON_MAP[iconName] || "info"
  const s = { color, stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", fill: "none" }
  const sm = { width: 16, height: 16, ...s }
  const map = {
    reply: <svg {...sm} viewBox="0 0 16 16"><path d="m6 3-4 4 4 4M2 7h8a3 3 0 0 1 3 3v2"/></svg>,
    play: <svg {...sm} viewBox="0 0 16 16"><polygon points="4,2 14,8 4,14" fill="currentColor" stroke="none"/></svg>,
    square: <svg {...sm} viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="2"/></svg>,
    "alert-circle": <svg {...sm} viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M8 5v3"/><path d="M8 11v.01"/></svg>,
    "alert-triangle": <svg {...sm} viewBox="0 0 16 16"><path d="M2 13 8 2l6 11Z"/><path d="M8 9v.01"/><path d="M8 6v2"/></svg>,
    info: <svg {...sm} viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M8 7v4"/><path d="M8 5v.01"/></svg>,
    "check-circle": <svg {...sm} viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="m5.5 8 2 2 3.5-4"/></svg>,
    webhook: <svg {...sm} viewBox="0 0 16 16"><path d="M8 4v4l2.5 2.5"/><circle cx="8" cy="2.5" r="1.5"/><circle cx="3" cy="6.5" r="1.5"/><circle cx="5" cy="13.5" r="1.5"/><circle cx="13" cy="10.5" r="1.5"/></svg>,
  }
  return <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{map[key]}</span>
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 7a5 5 0 0 0-10 0c0 4-2 6-2 6h14s-2-2-2-6"/>
      <path d="M7.5 16a1.5 1.5 0 0 0 3 0"/>
    </svg>
  )
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return "الآن"
  const min = Math.floor(sec / 60)
  if (min < 60) return `منذ ${min} د`
  const h = Math.floor(min / 60)
  if (h < 24) return `منذ ${h} س`
  const d = Math.floor(h / 24)
  if (d < 7) return `منذ ${d} ي`
  return new Date(iso).toLocaleDateString("ar-SA", { day: "numeric", month: "short" })
}

function isToday(iso) {
  const d = new Date(iso)
  const t = new Date()
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear()
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, clearAll, wsConnected } = useNotifications()
  const [open, setOpen] = useState(false)
  const [shake, setShake] = useState(false)
  const prevRef = useRef(unreadCount)
  const ref = useRef(null)

  // trigger shake animation when unread count increases
  useEffect(() => {
    if (unreadCount > prevRef.current) {
      setShake(true)
      const t = setTimeout(() => setShake(false), 500)
      prevRef.current = unreadCount
      return () => clearTimeout(t)
    }
    prevRef.current = unreadCount
  }, [unreadCount])

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const today = notifications.filter(n => isToday(n.timestamp))
  const earlier = notifications.filter(n => !isToday(n.timestamp))

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative size-9 flex items-center justify-center rounded-lg"
        style={{ color: "var(--muted)" }}
        aria-label={`الإشعارات${unreadCount ? ` (${unreadCount} غير مقروء)` : ""}`}
      >
        <span className={shake ? "notif-shake" : ""} style={{ display: "flex" }}>
          <BellIcon />
        </span>
        {unreadCount > 0 && (
          <span className="notif-badge absolute" style={{ top: -2, right: -2, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 16, height: 16, padding: "0 4px", fontSize: 10, fontWeight: 700, color: "#fff", background: "var(--danger)", borderRadius: 9999, boxShadow: "0 0 6px color-mix(in oklch, var(--danger) 60%, transparent)" }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        {!wsConnected && (
          <span className="absolute" style={{ bottom: -2, right: -2, width: 8, height: 8, borderRadius: "50%", background: "var(--warning)", animation: "pulse 2s ease-in-out infinite" }} />
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 w-[380px] max-w-[90vw] max-h-[80vh] flex flex-col rounded-2xl shadow-xl z-50 overflow-hidden"
          style={{ background: "color-mix(in oklch, var(--surface) 95%, transparent)", backdropFilter: "blur(24px)", border: "1px solid color-mix(in oklch, var(--border) 40%, transparent)", transformOrigin: "top left" }}
        >
          {/* header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid color-mix(in oklch, var(--border) 40%, transparent)" }}>
            <div className="flex items-center gap-2">
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>الإشعارات</h3>
              {unreadCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 500, color: "var(--danger)", background: "color-mix(in oklch, var(--danger) 10%, transparent)", padding: "1px 6px", borderRadius: 9999 }}>
                  {unreadCount} جديد
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {notifications.length > 0 && (
                <>
                  <button onClick={markAllRead} className="size-7 flex items-center justify-center rounded-lg" style={{ color: "var(--muted)" }} aria-label="تحديد الكل كمقروء">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m4 7 2 2 4-4"/><path d="M1.5 7.5 4 10l1-1M9 4l2-2 2 2"/></svg>
                  </button>
                  <button onClick={clearAll} className="size-7 flex items-center justify-center rounded-lg" style={{ color: "var(--muted)" }} aria-label="حذف الكل">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 3.5h10"/><path d="M4.5 3.5V2.2a.7.7 0 0 1 .7-.7h3.6a.7.7 0 0 1 .7.7v1.3"/><path d="M11 5l-.5 6.3a1 1 0 0 1-1 .9H4.5a1 1 0 0 1-1-.9L3 5"/></svg>
                  </button>
                </>
              )}
              <button onClick={() => setOpen(false)} className="size-7 flex items-center justify-center rounded-lg lg:hidden" style={{ color: "var(--muted)" }} aria-label="إغلاق">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m3 3 8 8M11 3l-8 8"/></svg>
              </button>
            </div>
          </div>

          {/* body */}
          <div className="flex-1 overflow-y-auto overscroll-contain" style={{ scrollbarWidth: "thin", scrollbarColor: "color-mix(in oklch, var(--border) 60%, transparent) transparent" }}>
            {!wsConnected && notifications.length === 0 && (
              <div className="flex items-center gap-2 px-4 py-3" style={{ fontSize: 12, color: "var(--warning)", background: "color-mix(in oklch, var(--warning) 5%, transparent)", borderBottom: "1px solid color-mix(in oklch, var(--warning) 10%, transparent)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warning)", animation: "pulse 2s ease-in-out infinite", flexShrink: 0 }} />
                جاري إعادة الاتصال...
              </div>
            )}

            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="size-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: "color-mix(in oklch, var(--muted) 50%, transparent)" }}>
                  <BellIcon />
                </div>
                <p style={{ fontSize: 14, fontWeight: 500, color: "color-mix(in oklch, var(--fg) 60%, transparent)" }}>لا توجد إشعارات</p>
                <p style={{ fontSize: 12, color: "color-mix(in oklch, var(--muted) 50%, transparent)", marginTop: 4 }}>سيتم عرض الإشعارات هنا عند ورودها</p>
              </div>
            ) : (
              <>
                {today.length > 0 && <GroupSection title="اليوم" items={today} />}
                {earlier.length > 0 && <GroupSection title="سابقاً" items={earlier} />}
              </>
            )}
          </div>

          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              style={{ width: "100%", padding: "10px 0", fontSize: 12, fontWeight: 500, color: "var(--muted)", borderTop: "1px solid color-mix(in oklch, var(--border) 40%, transparent)", background: "none", cursor: "pointer", flexShrink: 0 }}
            >
              مسح الكل
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function GroupSection({ title, items }) {
  const { markRead } = useNotifications()
  return (
    <div>
      <div className="px-4 py-2">
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "color-mix(in oklch, var(--muted) 40%, transparent)" }}>{title}</span>
      </div>
      {items.map(n => (
        <button
          key={n.id}
          onClick={() => markRead(n.id)}
          style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", textAlign: "right", background: n.read ? "none" : "color-mix(in oklch, var(--accent) 10%, transparent)", border: 0, cursor: "pointer", fontFamily: "inherit" }}
        >
          <div className="size-8 shrink-0 rounded-xl flex items-center justify-center" style={{ backgroundColor: n.color + "18" }}>
            <NtfIcon iconName={n.icon} color={n.color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: n.read ? 400 : 600, color: n.read ? "var(--muted)" : "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {n.title}
              </span>
              <span style={{ fontSize: 10, color: "color-mix(in oklch, var(--muted) 50%, transparent)", flexShrink: 0 }}>{timeAgo(n.timestamp)}</span>
            </div>
            <p style={{ fontSize: 11, color: "color-mix(in oklch, var(--muted) 70%, transparent)", marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.6 }}>{n.message}</p>
          </div>
          {!n.read && (
            <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, marginTop: 6, backgroundColor: n.color }} />
          )}
        </button>
      ))}
    </div>
  )
}

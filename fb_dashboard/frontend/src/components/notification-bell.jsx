"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Bell, CheckCheck, Trash2, MessageSquareReply, Play, Square,
  AlertCircle, AlertTriangle, Info, CheckCircle, Webhook,
  X,
} from "lucide-react"
import { useNotifications } from "@/hooks/use-notifications"
import { cn } from "@/lib/utils"

const ICON_MAP = {
  MessageSquareReply: MessageSquareReply,
  Play, Square, AlertCircle, Bell: AlertTriangle,
  AlertTriangle, Info, CheckCircle, Webhook,
}

function NtfIcon({ iconName, color, size = "size-[18px]" }) {
  const Icon = ICON_MAP[iconName] || Info
  return <Icon className={size} style={{ color }} />
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
  const ref = useRef(null)

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
        className="relative size-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
        aria-label={`الإشعارات${unreadCount ? ` (${unreadCount} غير مقروء)` : ""}`}
      >
        <motion.div
          animate={unreadCount > 0 ? { rotate: [0, -8, 8, -4, 4, 0] } : {}}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          <Bell className="size-[18px]" />
        </motion.div>
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-destructive rounded-full shadow-[0_0_6px_hsl(var(--destructive)/.6)]"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
        {!wsConnected && (
          <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-warning animate-pulse" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 top-full mt-2 w-[380px] max-w-[90vw] max-h-[80vh] flex flex-col rounded-2xl border border-border/40 bg-popover/95 backdrop-blur-2xl shadow-xl z-50 overflow-hidden"
            style={{ transformOrigin: "top left" }}
          >
            {/* header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">الإشعارات</h3>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-medium text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">
                    {unreadCount} جديد
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {notifications.length > 0 && (
                  <>
                    <button onClick={markAllRead} className="size-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors" aria-label="تحديد الكل كمقروء">
                      <CheckCheck className="size-3.5" />
                    </button>
                    <button onClick={clearAll} className="size-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors" aria-label="حذف الكل">
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
                <button onClick={() => setOpen(false)} className="size-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors lg:hidden" aria-label="إغلاق">
                  <X className="size-3.5" />
                </button>
              </div>
            </div>

            {/* body */}
            <div className="flex-1 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
              {!wsConnected && notifications.length === 0 && (
                <div className="flex items-center gap-2 px-4 py-3 text-xs text-warning bg-warning/5 border-b border-warning/10">
                  <span className="size-2 rounded-full bg-warning animate-pulse shrink-0" />
                  جاري إعادة الاتصال...
                </div>
              )}

              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div className="size-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
                    <Bell className="size-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-foreground/60">لا توجد إشعارات</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">سيتم عرض الإشعارات هنا عند ورودها</p>
                </div>
              ) : (
                <>
                  {today.length > 0 && <GroupSection title="اليوم" items={today} />}
                  {earlier.length > 0 && <GroupSection title="سابقاً" items={earlier} />}
                </>
              )}
            </div>

            {/* clear all at bottom if items exist */}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="w-full py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors border-t border-border/40 shrink-0"
              >
                مسح الكل
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function GroupSection({ title, items }) {
  const { markRead } = useNotifications()
  return (
    <div>
      <div className="px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40">{title}</span>
      </div>
      {items.map(n => (
        <button
          key={n.id}
          onClick={() => markRead(n.id)}
          className={cn(
            "w-full flex items-start gap-3 px-4 py-3 text-right transition-colors hover:bg-accent/30",
            !n.read && "bg-accent/10"
          )}
        >
          <div className="size-8 shrink-0 rounded-xl flex items-center justify-center" style={{ backgroundColor: n.color + "18" }}>
            <NtfIcon iconName={n.icon} color={n.color} size="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={cn("text-xs font-medium truncate", !n.read ? "text-foreground" : "text-muted-foreground")}>
                {n.title}
              </span>
              <span className="text-[10px] text-muted-foreground/50 shrink-0">{timeAgo(n.timestamp)}</span>
            </div>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate-2 leading-relaxed">{n.message}</p>
          </div>
          {!n.read && (
            <span className="size-1.5 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: n.color }} />
          )}
        </button>
      ))}
    </div>
  )
}

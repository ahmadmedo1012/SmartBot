"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react"

const MAX_HISTORY = 50
const DEDUP_WINDOW_MS = 5000
const WS_RECONNECT_MS = 5000

const NOTIF_TYPES = {
  reply:      { icon: "MessageSquareReply", color: "hsl(142 70% 45%)",  label: "رد جديد" },
  bot_started:{ icon: "Play",               color: "hsl(142 70% 45%)",  label: "تم التشغيل" },
  bot_stopped:{ icon: "Square",             color: "hsl(0 84% 60%)",    label: "تم الإيقاف" },
  error:      { icon: "AlertCircle",        color: "hsl(0 84% 60%)",    label: "خطأ" },
  alert:      { icon: "Bell",               color: "hsl(38 90% 55%)",   label: "تنبيه" },
  webhook:    { icon: "Webhook",            color: "hsl(211 85% 55%)",  label: "Webhook" },
  info:       { icon: "Info",               color: "hsl(211 85% 55%)",  label: "معلومات" },
  warning:    { icon: "AlertTriangle",      color: "hsl(38 90% 55%)",   label: "تحذير" },
  success:    { icon: "CheckCircle",        color: "hsl(142 70% 45%)",  label: "نجاح" },
}

const NtfCtx = createContext(null)

let _id = 0
function nextId() { return ++_id }

export function NotificationsProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const recentRef = useRef(new Map()) // dedup key -> timestamp
  const wsStatus = useRef("disconnected")
  const [wsConnected, setWsConnected] = useState(false)

  const add = useCallback((notif) => {
    const ntype = notif.type || "info"
    const typeMeta = NOTIF_TYPES[ntype] || NOTIF_TYPES.info
    const dedupKey = `${ntype}::${notif.title}`
    const now = Date.now()
    const last = recentRef.current.get(dedupKey)
    if (last && now - last < DEDUP_WINDOW_MS) return
    recentRef.current.set(dedupKey, now)
    const entry = {
      id: nextId(),
      type: ntype,
      icon: typeMeta.icon,
      color: typeMeta.color,
      title: notif.title || "",
      message: notif.message || "",
      link: notif.link || null,
      timestamp: notif.timestamp || new Date().toISOString(),
      read: false,
    }
    setNotifications(prev => [entry, ...prev].slice(0, MAX_HISTORY))
  }, [])

  const markRead = useCallback((id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
    recentRef.current.clear()
  }, [])

  const unreadCount = notifications.filter(n => !n.read).length

  // Map WS events to notifications
  const handleWsMessage = useCallback((msg) => {
    switch (msg.event) {
      case "new_reply":
        add({ type: "reply", title: "رد جديد", message: msg.data?.reply_text || "تم إرسال رد تلقائي", link: "/replies" })
        break
      case "bot_status":
        add({ type: msg.data?.status === "running" ? "bot_started" : "bot_stopped", title: "حالة البوت", message: msg.data?.message || "", link: "/settings" })
        break
      case "alert":
        add({ type: "alert", title: "تنبيه", message: msg.data?.message || "" })
        break
      case "error":
        add({ type: "error", title: "خطأ", message: msg.data?.message || "" })
        break
      case "webhook_event":
        add({ type: "webhook", title: "حدث Webhook", message: msg.data?.message || "", link: "/settings" })
        break
      case "notification":
        add(msg.data)
        break
    }
  }, [add])

  // WS lifecycle
  useEffect(() => {
    let ws = null
    let timer = null
    let mounted = true

    function connect() {
      wsStatus.current = "connecting"
      const proto = location.protocol === "https:" ? "wss:" : "ws:"
      ws = new WebSocket(`${proto}//${location.host}/ws`)
      ws.onopen = () => { if (mounted) { wsStatus.current = "connected"; setWsConnected(true) } }
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          handleWsMessage(msg)
        } catch {}
      }
      ws.onclose = () => {
        if (mounted) {
          wsStatus.current = "disconnected"
          setWsConnected(false)
          timer = setTimeout(connect, WS_RECONNECT_MS)
        }
      }
      ws.onerror = () => { ws?.close() }
    }
    connect()
    return () => { mounted = false; if (ws) ws.close(); clearTimeout(timer) }
  }, [handleWsMessage])

  return (
    <NtfCtx.Provider value={{ notifications, addNotification: add, markRead, markAllRead, clearAll, unreadCount, wsConnected }}>
      {children}
    </NtfCtx.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NtfCtx)
  if (!ctx) throw new Error("useNotifications must be inside NotificationsProvider")
  return ctx
}

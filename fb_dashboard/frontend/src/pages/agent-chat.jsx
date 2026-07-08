import { useState, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Bot, Send, Sparkles, CheckCircle2, XCircle, AlertCircle,
  Loader2, Zap,
} from "lucide-react"

const QUICK_ACTIONS = [
  { label: "الإحصائيات", command: "عطيني الإحصائيات" },
  { label: "نشر بوست", command: "انشر بوست ترحيبي لليوم" },
  { label: "شغل البوت", command: "شغل البوت" },
  { label: "قاعدة جديدة", command: "اضف قاعدة رد" },
]

export function AgentChat({ role }) {
  useEffect(() => { document.title = "الوكيل الذكي | SmartBot" }, [])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [confirmPending, setConfirmPending] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  const addMessage = (role, text, meta = {}) => {
    setMessages(prev => [...prev, { role, text, meta, id: Date.now() + Math.random() }])
  }

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return
    setInput("")
    addMessage("user", text)
    setLoading(true)

    try {
      const fd = new FormData()
      fd.append("text", text)
      const res = await fetch("/api/agent/interpret", { method: "POST", body: fd })
      const data = await res.json()

      if (data.need_confirmation) {
        setConfirmPending(data)
        addMessage("agent", `${data.response_ar}\n\n**تأكيد؟** اكتب "تم" أو "نعم" للتأكيد`, data)
      } else {
        addMessage("agent", data.response_ar || "تم التنفيذ ✅", data)
        if (data.action && data.action !== "unknown") {
          addMessage("system", `الإجراء: ${data.action} ${data.success ? "✅" : "❌"}`, data)
        }
      }
    } catch (e) {
      addMessage("agent", "عذراً، صار خطأ في الاتصال. حاول مرة ثانية 🙏")
    }
    setLoading(false)
  }

  const handleConfirm = async () => {
    if (!confirmPending) return
    setLoading(true)
    const origText = confirmPending.params?.raw || input
    try {
      const fd = new FormData()
      fd.append("text", origText || confirmPending.response_ar)
      const res = await fetch("/api/agent/confirm", { method: "POST", body: fd })
      const data = await res.json()
      addMessage("agent", data.response_ar || "تم التنفيذ ✅", data)
    } catch (e) {
      addMessage("agent", "فشل التنفيذ 😥")
    }
    setConfirmPending(null)
    setLoading(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (confirmPending) {
        handleConfirm()
      } else {
        sendMessage(input)
      }
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col h-[calc(100svh-3.5rem)] sm:-mx-6 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0 border-b">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
            <Bot className="size-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">الوكيل الذكي</h1>
            <p className="text-xs text-muted-foreground">تحدث مع البوت — انشر، رد، أنشئ قواعد</p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1.5 px-3 py-1 rounded-full text-xs">
          <Sparkles className="size-3 text-warning" />
          تجريبي
        </Badge>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="size-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-4">
              <Bot className="size-8 text-primary/40" />
            </div>
            <h2 className="text-sm font-semibold text-foreground mb-1">تحدث مع الوكيل الذكي</h2>
            <p className="text-xs text-muted-foreground max-w-xs mb-6">
              قل: "انشر بوست ترحيبي", "رد على التعليق الفلاني", "شغل البوت", "عطيني الإحصائيات"
            </p>
            {/* Quick actions */}
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_ACTIONS.map((qa, i) => (
                <button key={i} onClick={() => sendMessage(qa.command)}
                  className="px-3 py-1.5 rounded-full text-xs bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground border transition-all cursor-pointer">
                  <Zap className="size-3 inline ml-1" />
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] sm:max-w-[70%] ${msg.role === "user" ? "order-1" : "order-1"}`}>
              {msg.role === "system" ? (
                <div className="text-[10px] text-muted-foreground/60 text-center py-1">{msg.text}</div>
              ) : (
                <div className={`p-3 rounded-2xl text-sm shadow-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted/60 text-foreground rounded-bl-md border"
                }`}>
                  {msg.text}
                </div>
              )}
              {msg.meta?.action && msg.role === "agent" && (
                <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground px-1">
                  <Badge variant="outline" className="text-[9px] px-1 py-0 rounded-full">
                    {msg.meta.action}
                  </Badge>
                  {msg.meta.success !== undefined && (
                    msg.meta.success
                      ? <CheckCircle2 className="size-3 text-success" />
                      : <XCircle className="size-3 text-destructive" />
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="p-3 rounded-2xl bg-muted/60 border rounded-bl-md">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">جاري التفكير...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Confirmation bar */}
      {confirmPending && (
        <div className="px-4 py-2 border-t bg-warning/5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="size-3.5 text-warning" />
              تأكيد الإجراء؟ هذا الإجراء سيتم تنفيذه فعلياً
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setConfirmPending(null)}>
                إلغاء
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={handleConfirm} disabled={loading}>
                {loading ? "..." : "تأكيد"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t p-4 shrink-0">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={confirmPending ? 'اكتب "تم" للتأكيد...' : "قل: انشر بوست ترحيبي..."}
              rows={2}
              className="min-h-0 resize-none text-sm"
              disabled={loading}
            />
          </div>
          <Button
            onClick={() => confirmPending ? handleConfirm() : sendMessage(input)}
            disabled={(!input.trim() && !confirmPending) || loading}
            className="shrink-0 h-10 px-4 gap-2"
          >
            <Send className="size-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          أنا وكيل ذكي — أنفذ أوامرك مباشرة على فيسبوك
        </p>
      </div>
      <div className="mobile-nav-spacer" />
    </motion.div>
  )
}

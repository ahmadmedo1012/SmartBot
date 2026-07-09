import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Bot, Send, Sparkles, CheckCircle2, XCircle,
  Loader2, Zap, ImagePlus, X, Eye, Brain,
  History, Trash2,
} from "lucide-react"

const QUICK_ACTIONS = [
  { label: "الإحصائيات", command: "عطيني الإحصائيات" },
  { label: "نشر بوست", command: "انشر بوست ترحيبي" },
  { label: "حملة تخفيضات", command: "انشر حملة تخفيضات على منتجاتنا" },
  { label: "شغل البوت", command: "شغل البوت" },
]

const AUTO_SUGGESTIONS = {
  publish_post: "منشورات مقترحة: ترحيبي، عروض، عيد",
  reply_to_comment: "توفر إضافة ردود سريعة للتعليقات",
  list_stats: "حمل التقارير الكاملة من صفحة التحليلات",
}

export function AgentChat() {
  useEffect(() => { document.title = "الوكيل الذكي | SmartBot" }, [])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [imageAnalysis, setImageAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [timeline, setTimeline] = useState([])
  const [showTimeline, setShowTimeline] = useState(false)
  const [lastAction, setLastAction] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  // Load recent timeline on mount
  useEffect(() => {
    fetch("/api/agent/memory")
      .then(r => r.json())
      .then(d => {
        if (d?.session?.length) setTimeline(d.session.slice(-10))
      })
      .catch(() => {})
  }, [])

  const addMessage = useCallback((role, text, meta = {}) => {
    setMessages(prev => [...prev, { role, text, meta, id: Date.now() + Math.random() }])
  }, [])

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { alert("الصورة كبيرة — أقصى حجم 10MB"); return }
    setImageFile(file)
    setImageAnalysis(null)
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const removeImage = () => {
    setImageFile(null); setImagePreview(null); setImageAnalysis(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return
    setInput("")
    addMessage("user", text)
    setLoading(true)

    try {
      const fd = new FormData()
      fd.append("text", text)
      if (imageFile) { fd.append("image", imageFile); fd.append("has_image", "true") }
      const res = await fetch("/api/agent/interpret", { method: "POST", body: fd })
      const data = await res.json()

      const statusIcon = data.success ? " ✅" : " ❌"
      addMessage("agent", data.response_ar || "تم التنفيذ" + statusIcon, data)
      if (data.action && data.action !== "unknown") {
        addMessage("system", `الإجراء: ${data.action}${data.success ? " ✅" : " ❌"}`, data)
      }

      setLastAction(data.action)
      if (data.action && data.action !== "unknown") {
        setTimeline(prev => {
          const entry = { action: data.action, text: text.slice(0, 60), success: data.success, time: new Date().toLocaleTimeString("ar") }
          const next = [entry, ...prev].slice(0, 20)
          return next
        })
      }

      // Image analysis overlay
      if (imageFile) {
        setAnalyzing(true)
        try {
          const aiRes = await fetch("/api/ai/analyze-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          })
          if (aiRes.ok) {
            const aiData = await aiRes.json()
            setImageAnalysis(aiData.analysis || "تم تحليل الصورة")
          }
        } catch (_) {}
        setAnalyzing(false)
      }

      removeImage()
    } catch (e) {
      addMessage("agent", "عذراً، صار خطأ في الاتصال. حاول مرة ثانية 🙏")
    }
    setLoading(false)
  }

  const clearMemory = async () => {
    await fetch("/api/agent/memory/clear", { method: "POST" })
    setMessages([])
    setTimeline([])
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const suggestion = AUTO_SUGGESTIONS[lastAction]

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
            <Brain className="size-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">الوكيل الذكي v2</h1>
            <p className="text-xs text-muted-foreground">يتصرف بذكاء — ينفذ مباشرة بدون تأكيد</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowTimeline(!showTimeline)} title="سجل النشاط">            <History className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearMemory} title="مسح الذاكرة">
            <Trash2 className="size-4" />
          </Button>
          <Badge variant="outline" className="gap-1.5 px-3 py-1 rounded-full text-xs border-success text-success">
            <Sparkles className="size-3" />
            تنفيذ تلقائي
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Timeline sidebar */}
        <AnimatePresence>
          {showTimeline && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 220, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-l shrink-0 overflow-hidden bg-muted/20"
            >
              <div className="p-3 space-y-1.5 w-[220px]">
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">آخر النشاط</h3>
                {timeline.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/60">لا نشاط بعد</p>
                )}
                {timeline.map((entry, i) => (
                  <div key={i} className="text-[10px] border-r-2 border-primary/20 pr-2 py-0.5">
                    <div className="flex items-center gap-1">
                      <span className={entry.success ? "text-success" : "text-destructive"}>
                        {entry.success ? "✓" : "✗"}
                      </span>
                      <span className="font-medium text-foreground/80">{entry.action}</span>
                    </div>
                    <p className="text-muted-foreground/60 truncate">{entry.text}</p>
                    <p className="text-muted-foreground/40">{entry.time}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="size-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-4">
                <Bot className="size-8 text-primary/40" />
              </div>
              <h2 className="text-sm font-semibold text-foreground mb-1">تحدث مع الوكيل الذكي</h2>
              <p className="text-xs text-muted-foreground max-w-xs mb-6">
                الوكيل ينفذ أوامرك مباشرة — يحلل، يحسّن، ينشر، بلا تأكيد
              </p>
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
              <div className={`max-w-[85%] sm:max-w-[70%]`}>
                {msg.role === "system" ? (
                  <div className="text-[10px] text-muted-foreground/60 text-center py-1 flex items-center justify-center gap-1">
                    {msg.text}
                  </div>
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

          {/* Image analysis overlay */}
          {analyzing && (
            <div className="flex justify-start">
              <div className="p-3 rounded-2xl bg-muted/60 border rounded-bl-md">
                <div className="flex items-center gap-2">
                  <Eye className="size-4 text-primary" />
                  <span className="text-xs text-muted-foreground">جاري تحليل الصورة...</span>
                </div>
              </div>
            </div>
          )}

          {loading && !analyzing && (
            <div className="flex justify-start">
              <div className="p-3 rounded-2xl bg-muted/60 border rounded-bl-md">
                <div className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">جاري التفكير والتنفيذ...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Auto-suggest bar */}
      {suggestion && messages.length > 0 && (
        <div className="px-4 py-1.5 border-t bg-primary/5 shrink-0">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Sparkles className="size-2.5 text-primary" />
            {suggestion}
          </p>
        </div>
      )}

      {/* Image preview bar */}
      {imagePreview && (
        <div className="px-4 py-2 border-t shrink-0">
          <div className="relative inline-block">
            <img src={imagePreview} alt="Preview" className="h-20 rounded-lg border object-cover" />
            {imageAnalysis && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent text-[9px] text-white px-1.5 py-0.5 rounded-b-lg truncate">
                {imageAnalysis}
              </div>
            )}
            <button onClick={removeImage}
              className="absolute -top-2 -right-2 size-5 rounded-full bg-destructive text-white flex items-center justify-center cursor-pointer">
              <X className="size-3" />
            </button>
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
              placeholder="قل: انشر بوست ترحيبي..."
              rows={2}
              className="min-h-0 resize-none text-sm"
              disabled={loading}
            />
          </div>
          <div className="flex gap-1 shrink-0">
            <input type="file" accept="image/*" ref={fileRef} onChange={handleImageSelect} className="hidden" />
            <Button variant="outline" size="icon" className="h-10 w-10"
              onClick={() => fileRef.current?.click()} disabled={loading} title="إرفاق صورة">
              <ImagePlus className="size-4" />
            </Button>
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="h-10 px-4 gap-2"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
          🧠 ينفذ مباشرة — كل الإجراءات تلقائية بدون تأكيد
        </p>
      </div>
      <div className="mobile-nav-spacer" />
    </motion.div>
  )
}

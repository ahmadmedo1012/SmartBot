import { motion } from "framer-motion"
import { useState, useEffect } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { fetchAiStatus, fetchTemplates } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  Brain, Sparkles, Send, ThumbsUp, ThumbsDown, Meh,
  Copy, Check, MessageSquare, Zap,
} from "lucide-react"

function api(path, opts = {}) {
  const fd = opts.body instanceof FormData ? opts.body : new FormData()
  if (!(opts.body instanceof FormData) && opts.body) {
    Object.entries(opts.body).forEach(([k, v]) => fd.append(k, v))
  }
  return fetch(path, {
    ...opts,
    body: fd,
    headers: fd instanceof FormData ? {} : { "Content-Type": "application/json", ...opts.headers },
  }).then(async r => { const t = await r.text(); if (!r.ok) throw new Error(t.slice(0, 200)); return JSON.parse(t) })
}

export function AiAssistant({ role }) {
  useEffect(() => { document.title = "المساعد الذكي | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const [commentText, setCommentText] = useState("")
  const [commenterName, setCommenterName] = useState("")
  const [pageContext, setPageContext] = useState("")
  const [suggestions, setSuggestions] = useState([])
  const [aiIntent, setAiIntent] = useState("")
  const [aiSentiment, setAiSentiment] = useState("")
  const [aiConfidence, setAiConfidence] = useState(0)
  const [aiLatency, setAiLatency] = useState(0)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [activeTab, setActiveTab] = useState("suggest")

  const { data: aiStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["ai-status"], queryFn: fetchAiStatus,
  })
  const { data: templates = [] } = useQuery({
    queryKey: ["templates"], queryFn: () => fetchTemplates(),
  })

  const suggestMut = useMutation({
    mutationFn: () => api("/api/ai/suggest", { method: "POST", body: { comment_text: commentText, commenter_name: commenterName, page_context: pageContext } }),
    onSuccess: (d) => { setSuggestions(d.suggestions || []); setAiIntent(d.intent || ""); setAiSentiment(d.sentiment || ""); setAiConfidence(d.confidence || 0); setAiLatency(d.latency_ms || 0) },
    onError: (e) => toast.error(e.message),
  })

  const analyzeMut = useMutation({
    mutationFn: () => api("/api/ai/analyze", { method: "POST", body: { comment_text: commentText } }),
    onSuccess: (d) => setAnalysisResult(d),
    onError: (e) => toast.error(e.message),
  })

  const generateMut = useMutation({
    mutationFn: () => api("/api/ai/generate-reply", { method: "POST", body: { comment_text: commentText, commenter_name: commenterName, tone: aiSentiment } }),
    onSuccess: (d) => { if (d.reply) setSuggestions(prev => [d.reply, ...prev].slice(0, 3)) },
    onError: (e) => toast.error(e.message),
  })

  const [copiedIdx, setCopiedIdx] = useState(null)
  const copyToClipboard = (text, idx) => {
    navigator.clipboard.writeText(text).then(() => { setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000) })
  }

  const sentimentIcon = (s) => {
    if (s === "إيجابي" || s === "positive") return <ThumbsUp className="size-4 text-success" />
    if (s === "سلبي" || s === "negative") return <ThumbsDown className="size-4 text-destructive" />
    return <Meh className="size-4 text-info" />
  }

  if (statusLoading) {
    return <div className="flex justify-center py-20"><Skeleton className="h-20 w-64 rounded-lg" /></div>
  }

  if (!aiStatus?.available) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="content-container space-y-6 animate-fade-in">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold">المساعد الذكي</h1>
          <p className="text-sm text-muted-foreground mt-1">توليد ردود ذكية باستخدام الذكاء الاصطناعي</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Brain className="h-16 w-16 text-muted-foreground/30 mb-5" />
            <h2 className="text-lg font-semibold text-foreground mb-2">AI غير مفعل</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              لتفعيل المساعد الذكي، قم بتعيين مفتاح API في متغيرات البيئة:
            </p>
            <div className="bg-muted rounded-lg p-4 text-left font-mono text-sm space-y-2 rtl:text-right" dir="ltr">
              <code>OPENAI_API_KEY=sk-xxxx</code><br />
              <span className="text-muted-foreground text-xs">أو</span><br />
              <code>GEMINI_API_KEY=AIzaxxxx</code>
            </div>
            {canEdit && (
              <p className="text-xs text-muted-foreground mt-4">
                عدّل المتغيرات في Render Dashboard → Environment Variables
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="content-container space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold flex items-center gap-2">
            <Brain className="size-6 text-info" />
            المساعد الذكي
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            توليد ردود ذكية وتحليل تعليقات باستخدام {aiStatus.provider}
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 px-3 py-1 rounded-full text-xs">
          <Sparkles className="size-3.5 text-warning" />
          {aiStatus.provider}
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab("suggest")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "suggest" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
          <Send className="inline size-4 ml-1" />توليد ردود
        </button>
        <button onClick={() => setActiveTab("analyze")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "analyze" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
          <MessageSquare className="inline size-4 ml-1" />تحليل تعليق
        </button>
        <button onClick={() => setActiveTab("templates")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "templates" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
          <Zap className="inline size-4 ml-1" />قوالب الردود
        </button>
      </div>

      {/* ── Tab: Suggest ── */}
      {activeTab === "suggest" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">بيانات التعليق</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">نص التعليق *</label>
                <Textarea value={commentText} onChange={e => setCommentText(e.target.value)}
                  rows={3} placeholder="اكتب تعليق العميل هنا..." />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">اسم العميل</label>
                <Input value={commenterName} onChange={e => setCommenterName(e.target.value)}
                  placeholder="أحمد" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">سياق الصفحة (اختياري)</label>
                <Input value={pageContext} onChange={e => setPageContext(e.target.value)}
                  placeholder="متجر ملابس، خدمة عملاء، ..." />
              </div>
              <Button onClick={() => suggestMut.mutate()} disabled={!commentText.trim() || suggestMut.isPending}
                className="w-full gap-2">
                <Brain className="size-4" />
                {suggestMut.isPending ? "جاري التوليد..." : "توليد ردود ذكية"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">الردود المقترحة</CardTitle>
                {aiIntent && (
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="rounded-full px-2">
                      {sentimentIcon(aiSentiment)} {aiSentiment}
                    </Badge>
                    <Badge variant="outline" className="rounded-full px-2">{aiIntent}</Badge>
                    {aiConfidence > 0 && <span className="text-muted-foreground">{Math.round(aiConfidence * 100)}%</span>}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {suggestions.length === 0 && !suggestMut.isPending ? (
                <div className="flex flex-col items-center py-12">
                  <Sparkles className="h-10 w-10 text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">الردود ستظهر هنا</p>
                </div>
              ) : suggestMut.isPending ? (
                <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
              ) : (
                suggestions.map((s, i) => (
                  <div key={i} className="p-3 rounded-lg border bg-card hover:shadow-sm transition-all">
                    <p className="text-sm text-foreground mb-2">{s}</p>
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => copyToClipboard(s, i)}>
                        {copiedIdx === i ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
                        {copiedIdx === i ? "تم النسخ" : "نسخ"}
                      </Button>
                    </div>
                  </div>
                ))
              )}
              {aiLatency > 0 && (
                <p className="text-xs text-muted-foreground text-center">تم التوليد في {aiLatency}ms</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tab: Analyze ── */}
      {activeTab === "analyze" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">نص التعليق</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea value={commentText} onChange={e => setCommentText(e.target.value)}
                rows={4} placeholder="الصق تعليق العميل للتحليل..." />
              <Button onClick={() => { analyzeMut.mutate(); suggestMut.mutate() }}
                disabled={!commentText.trim() || analyzeMut.isPending} className="w-full gap-2">
                <MessageSquare className="size-4" />
                {analyzeMut.isPending ? "جاري التحليل..." : "تحليل"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">نتيجة التحليل</CardTitle>
            </CardHeader>
            <CardContent>
              {!analysisResult ? (
                <div className="flex flex-col items-center py-12">
                  <Brain className="h-10 w-10 text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">التحليل سيظهر هنا</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">الشعور</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        {sentimentIcon(analysisResult.sentiment)}
                        <span className="text-sm font-semibold">{analysisResult.sentiment}</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">النية</p>
                      <p className="text-sm font-semibold mt-1">{analysisResult.intent}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">الإلحاح</p>
                      <p className="text-sm font-semibold mt-1">{Math.round((analysisResult.urgency || 0) * 100)}%</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">مواضيع رئيسية</p>
                      <p className="text-sm font-semibold mt-1">{(analysisResult.key_topics || []).join("، ") || "—"}</p>
                    </div>
                  </div>
                  {analysisResult.summary && (
                    <div className="p-3 rounded-lg bg-info/10 border border-info/20">
                      <p className="text-xs text-info font-medium mb-1">ملخص</p>
                      <p className="text-sm text-foreground">{analysisResult.summary}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tab: Templates ── */}
      {activeTab === "templates" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">قوالب الردود المتاحة ({templates.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {templates.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <Zap className="h-10 w-10 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">لا توجد قوالب بعد. أضف من صفحة "ردود سريعة"</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.slice(0, 9).map(t => (
                  <div key={t.id} className="p-3 rounded-lg border hover:shadow-sm transition-all cursor-pointer"
                    onClick={() => { setCommentText(prev => prev + t.text); toast.success("تم إدراج القالب") }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-full">{t.category}</Badge>
                      {t.shortcut && <span className="text-[10px] font-mono text-info">{t.shortcut}</span>}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{t.text}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <div className="mobile-nav-spacer" />
    </motion.div>
  )
}
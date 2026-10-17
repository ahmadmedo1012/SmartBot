"use client"

/**
 * W2-C2a — ShellAssistantBar: the persistent bottom AI interaction surface
 * (≈88px, spec §1/§3). Mapped to SmartBot's REAL assistant concept: the
 * deployed POST /api/ai/suggest endpoint (routers/ai.py — the same engine
 * AiSuggestDialog uses on the messages page). The input is honest: paste a
 * customer message → the engine proposes ready replies → copy to clipboard.
 * Every state is REAL: loading, the server's Arabic error (e.g. «AI غير
 * مفعل — …» when no provider keys), or the first suggestion — never a fake
 * submit. Desktop (md+) only; mobile keeps MobileBottomNav (Track F).
 */

import { useState } from "react"
import { Bot, Copy, Loader2, Send } from "lucide-react"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { brandedToast } from "@/lib/premium-toast"
import "./dashboard-shell.css"

interface SuggestData {
  suggestions?: string[]
  intent?: string
  sentiment?: string
  confidence?: number
}

type Result =
  | { tone: "idle" }
  | { tone: "loading" }
  | { tone: "error"; message: string }
  | { tone: "ok"; suggestion: string }

export function ShellAssistantBar() {
  const [text, setText] = useState("")
  const [result, setResult] = useState<Result>({ tone: "idle" })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = text.trim()
    if (!value || result.tone === "loading") return
    setResult({ tone: "loading" })
    try {
      const form = new FormData()
      form.set("comment_text", value)
      form.set("page_context", "dashboard")
      const data = await apiFetch("/api/ai/suggest", { method: "POST", body: form }).then(
        unwrapApi<SuggestData>,
      )
      const suggestion = (data.suggestions ?? [])[0] ?? ""
      setResult(
        suggestion
          ? { tone: "ok", suggestion }
          : { tone: "error", message: "لم يقترح المحرك ردودًا لهذه الرسالة" },
      )
    } catch (err) {
      /* the server's own Arabic detail surfaces verbatim (ApiError) */
      setResult({ tone: "error", message: (err as Error)?.message || "تعذّر الوصول إلى المساعد" })
    }
  }

  const copy = async () => {
    if (result.tone !== "ok") return
    try {
      await navigator.clipboard.writeText(result.suggestion)
      brandedToast.success("تم نسخ الرد المقترح")
    } catch {
      brandedToast.error("تعذّر النسخ إلى الحافظة")
    }
  }

  return (
    <section className="sb-assistant" aria-label="مساعد SmartBot">
      {/* result line — the engine's real verdict (or its real error) */}
      <div className="sb-assistant-result" data-tone={result.tone === "error" ? "error" : undefined} aria-live="polite">
        {result.tone === "idle" && (
          <span className="truncate">الصق رسالة عميل وسيقترح المساعد ردودًا جاهزة — «اقترح ردًا».</span>
        )}
        {result.tone === "loading" && (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> جارٍ التفكير…
          </span>
        )}
        {result.tone === "error" && <strong className="truncate">{result.message}</strong>}
        {result.tone === "ok" && (
          <>
            <Bot className="size-3.5 shrink-0 text-accent-ink" aria-hidden="true" />
            <strong className="min-w-0 flex-1" title={result.suggestion}>{result.suggestion}</strong>
            <button type="button" onClick={copy} className="sb-assistant-copy">
              <Copy className="size-3" aria-hidden="true" /> نسخ
            </button>
          </>
        )}
      </div>

      {/* the persistent input — rounded field + send (spec §1) */}
      <form className="sb-assistant-form" onSubmit={submit}>
        <div className="sb-assistant-input">
          <Bot className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="اكتب رسالة العميل هنا — سيقترح المساعد ردودًا جاهزة…"
            aria-label="مساعد SmartBot — رسالة العميل لاقتراح رد"
            disabled={result.tone === "loading"}
            maxLength={2000}
          />
        </div>
        <button
          type="submit"
          className="sb-assistant-send"
          disabled={!text.trim() || result.tone === "loading"}
          aria-label="اقترح ردًا"
        >
          <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </button>
      </form>
    </section>
  )
}

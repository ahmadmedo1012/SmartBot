"use client"

/* v6 §D — framer-free critical path: this component sits in the landing
 * hero, and every framer `initial opacity:0` here meant the mockup (the
 * largest visual block = the LCP candidate on desktop) only appeared after
 * full hydration + staggered springs. Pure-CSS entrances paint at
 * style-apply time — no JS dependency, and framer-motion itself drops out
 * of the landing's initial bundle entirely (it now loads only inside the
 * lazily-imported below-fold sections). */

import { Bot, MessageCircle, Sparkles, Check, TrendingUp } from "lucide-react"

/* Mock data follows the v6 §A convention: ar-LY (Western digits + dot
 * grouping) — the same format formatNumber() renders everywhere else. */
const conversation = [
  { from: "user", name: "محمد المنصوري", text: "هل المنتج متوفر؟", time: "الآن", avatar: "م" },
  { from: "bot", text: "أهلاً محمد! نعم المنتج متوفر، السعر 240 د.ل. هل تريد تأكيد الطلب؟", time: "الآن" },
  { from: "user", name: "سارة التارقية", text: "كم تكلفة التوصيل لطرابلس؟", time: "قبل دقيقتين", avatar: "س" },
  { from: "bot", text: "التوصيل لطرابلس 15 د.ل خلال 24 ساعة. هل أنسّق لك طلباً؟", time: "قبل دقيقتين" },
]

const liveStats = [
  { icon: MessageCircle, label: "ردود اليوم", value: "1.247", delta: "+12%" },
  { icon: Check, label: "معدل الحل", value: "94%", delta: "+3%" },
  { icon: TrendingUp, label: "تفاعل", value: "+28%", delta: "هذا الأسبوع" },
]

export function HeroMockup() {
  return (
    <div className="relative animate-fade-in-400" aria-hidden="true">
      {/* v8-B16: the whole mockup (fake conversation + stats) is decorative
          marketing imagery duplicating surrounding copy — hidden from AT. */}
      {/* Soft glow under the mockup */}
      <div className="absolute -inset-12 bg-accent-foreground/10 blur-3xl rounded-[40%]" aria-hidden="true" />

      {/* Floating stat card — top right */}
      <div className="absolute -top-6 right-0 sm:right-4 z-20 glass-strong rounded-2xl p-3 sm:p-4 shadow-xl min-w-[180px] animate-fade-in-900">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="size-7 rounded-lg bg-accent-foreground/15 flex items-center justify-center">
            <TrendingUp className="size-3.5 text-accent-foreground" />
          </div>
          <span className="text-3xs font-semibold text-muted-foreground uppercase tracking-wider">التفاعل</span>
        </div>
        <div className="text-2xl font-bold text-accent-foreground leading-none mb-1">+28%</div>
        <div className="text-2xs text-muted-foreground">هذا الأسبوع</div>
      </div>

      {/* Floating reply counter — bottom left */}
      <div className="absolute -bottom-4 -left-2 sm:left-2 z-20 glass-strong rounded-2xl p-3 sm:p-4 shadow-xl animate-fade-in-1100">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-gradient-to-br from-accent-foreground to-accent-foreground/70 flex items-center justify-center shadow-md">
            <Bot className="size-4.5 text-white" />
          </div>
          <div>
            <div className="text-3xs text-muted-foreground font-medium">الردود الذكية</div>
            <div className="text-sm font-bold leading-tight">1.247 <span className="text-accent-foreground text-xs">اليوم</span></div>
          </div>
        </div>
      </div>

      {/* Main mockup card — chat conversation */}
      <div className="relative glass-strong rounded-3xl p-1 shadow-2xl shadow-accent-foreground/5">
        <div className="rounded-[20px] bg-card/80 backdrop-blur-xl border border-border/50 overflow-hidden">
          {/* Window header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="size-2.5 rounded-full bg-destructive/60" />
                <div className="size-2.5 rounded-full bg-warning/60" />
                <div className="size-2.5 rounded-full bg-success/60" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-success animate-pulse" />
              <span className="text-3xs font-semibold text-muted-foreground">نشط الآن</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3 text-accent-foreground" />
              <span className="text-3xs font-semibold text-accent-foreground">AI</span>
            </div>
          </div>

          {/* Conversation stream */}
          <div className="p-4 sm:p-5 space-y-3 max-h-[420px]">
            {conversation.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2.5 animate-fade-in-1100 ${msg.from === "user" ? "flex-row" : "flex-row-reverse"}`}
                style={{ animationDelay: `${1200 + i * 150}ms` }}
              >
                {msg.from === "user" ? (
                  <div className="size-8 rounded-full bg-gradient-to-br from-accent-foreground/20 to-accent-foreground/5 border border-accent-foreground/20 flex items-center justify-center text-2xs font-bold text-accent-foreground shrink-0">
                    {msg.avatar}
                  </div>
                ) : (
                  <div className="size-8 rounded-full bg-gradient-to-br from-accent-foreground to-accent-foreground/70 flex items-center justify-center shrink-0 shadow-md shadow-accent-foreground/20">
                    <Bot className="size-4 text-primary-foreground" />
                  </div>
                )}
                <div className={`flex-1 ${msg.from === "user" ? "items-start" : "items-end"} flex flex-col`}>
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-3xs font-bold text-foreground/80">{msg.from === "user" ? msg.name : "SmartBot"}</span>
                    <span className="text-[9px] text-muted-foreground/60">{msg.time}</span>
                  </div>
                  <div
                    className={`px-3.5 py-2 rounded-2xl text-[12.5px] leading-relaxed max-w-[85%] ${
                      msg.from === "user"
                        ? "bg-muted/60 text-foreground/90 rounded-tr-sm"
                        : "bg-gradient-to-br from-accent-foreground to-accent-foreground/85 text-primary-foreground rounded-tl-sm shadow-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            <div className="flex gap-2.5 flex-row-reverse animate-fade-in-1100" style={{ animationDelay: "2000ms" }}>
              <div className="size-8 rounded-full bg-gradient-to-br from-accent-foreground to-accent-foreground/70 flex items-center justify-center shrink-0">
                <Bot className="size-4 text-primary-foreground" />
              </div>
              <div className="bg-gradient-to-br from-accent-foreground/10 to-accent-foreground/5 border border-accent-foreground/20 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>

          {/* Footer — live stats bar */}
          <div className="border-t border-border/40 bg-muted/10 px-4 py-3">
            <div className="grid grid-cols-3 gap-3">
              {liveStats.map((stat, i) => (
                <div key={stat.label} className="text-center animate-fade-in-1100" style={{ animationDelay: `${2200 + i * 100}ms` }}>
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <stat.icon className="size-3 text-accent-foreground" />
                    <span className="text-[9px] text-muted-foreground font-medium">{stat.label}</span>
                  </div>
                  <div className="text-sm font-bold leading-none">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

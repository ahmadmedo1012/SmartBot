"use client"

import { motion } from "framer-motion"
import { Bot, MessageCircle, Sparkles, Check, TrendingUp } from "lucide-react"
import { springDefault, springSnappy } from "@/lib/motion"

const conversation = [
  { from: "user", name: "محمد المنصوري", text: "هل المنتج متوفر؟", time: "الآن", avatar: "م" },
  { from: "bot", text: "أهلاً محمد! نعم المنتج متوفر، السعر ٢٤٠ د.ل. هل تريد تأكيد الطلب؟", time: "الآن" },
  { from: "user", name: "سارة التارقية", text: "كم تكلفة التوصيل لطرابلس؟", time: "قبل ٢ دقيقة", avatar: "س" },
  { from: "bot", text: "التوصيل لطرابلس ١٥ د.ل خلال ٢٤ ساعة. هل أنسّق لك طلباً؟", time: "قبل ٢ دقيقة" },
]

const liveStats = [
  { icon: MessageCircle, label: "ردود اليوم", value: "١٬٢٤٧", delta: "+١٢٪" },
  { icon: Check, label: "معدل الحل", value: "٩٤٪", delta: "+٣٪" },
  { icon: TrendingUp, label: "تفاعل", value: "+٢٨٪", delta: "هذا الأسبوع" },
]

export function HeroMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...springDefault, delay: 0.4, duration: 0.9 }}
      className="relative"
    >
      {/* Soft glow under the mockup */}
      <div className="absolute -inset-12 bg-orange/10 blur-3xl rounded-[40%]" aria-hidden="true" />

      {/* Floating stat card — top right */}
      <motion.div
        initial={{ opacity: 0, x: 20, y: -10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ ...springSnappy, delay: 0.9 }}
        className="absolute -top-6 -right-2 sm:right-4 z-20 glass-strong rounded-2xl p-3 sm:p-4 shadow-xl min-w-[180px]"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <div className="size-7 rounded-lg bg-orange/15 flex items-center justify-center">
            <TrendingUp className="size-3.5 text-orange" />
          </div>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">التفاعل</span>
        </div>
        <div className="text-2xl font-bold text-orange leading-none mb-1">+٢٨٪</div>
        <div className="text-[11px] text-muted-foreground">هذا الأسبوع</div>
      </motion.div>

      {/* Floating reply counter — bottom left */}
      <motion.div
        initial={{ opacity: 0, x: -20, y: 10 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ ...springSnappy, delay: 1.1 }}
        className="absolute -bottom-4 -left-2 sm:left-2 z-20 glass-strong rounded-2xl p-3 sm:p-4 shadow-xl"
      >
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-gradient-to-br from-orange to-orange/70 flex items-center justify-center shadow-md">
            <Bot className="size-4.5 text-white" />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground font-medium">الردود الذكية</div>
            <div className="text-sm font-bold leading-tight">١٬٢٤٧ <span className="text-orange text-xs">اليوم</span></div>
          </div>
        </div>
      </motion.div>

      {/* Main mockup card — chat conversation */}
      <div className="relative glass-strong rounded-3xl p-1 shadow-2xl shadow-orange/5">
        <div className="rounded-[20px] bg-card/80 backdrop-blur-xl border border-border/50 overflow-hidden">
          {/* Window header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="size-2.5 rounded-full bg-red-400/60" />
                <div className="size-2.5 rounded-full bg-yellow-400/60" />
                <div className="size-2.5 rounded-full bg-green-400/60" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-semibold text-muted-foreground">نشط الآن</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3 text-orange" />
              <span className="text-[10px] font-semibold text-orange">AI</span>
            </div>
          </div>

          {/* Conversation stream */}
          <div className="p-4 sm:p-5 space-y-3 max-h-[420px]">
            {conversation.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springSnappy, delay: 1.2 + i * 0.15 }}
                className={`flex gap-2.5 ${msg.from === "user" ? "flex-row" : "flex-row-reverse"}`}
              >
                {msg.from === "user" ? (
                  <div className="size-8 rounded-full bg-gradient-to-br from-orange/20 to-orange/5 border border-orange/20 flex items-center justify-center text-[11px] font-bold text-orange shrink-0">
                    {msg.avatar}
                  </div>
                ) : (
                  <div className="size-8 rounded-full bg-gradient-to-br from-orange to-orange/70 flex items-center justify-center shrink-0 shadow-md shadow-orange/20">
                    <Bot className="size-4 text-white" />
                  </div>
                )}
                <div className={`flex-1 ${msg.from === "user" ? "items-start" : "items-end"} flex flex-col`}>
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[10px] font-bold text-foreground/80">{msg.from === "user" ? msg.name : "SmartBot"}</span>
                    <span className="text-[9px] text-muted-foreground/60">{msg.time}</span>
                  </div>
                  <div
                    className={`px-3.5 py-2 rounded-2xl text-[12.5px] leading-relaxed max-w-[85%] ${
                      msg.from === "user"
                        ? "bg-muted/60 text-foreground/90 rounded-tr-sm"
                        : "bg-gradient-to-br from-orange to-orange/85 text-white rounded-tl-sm shadow-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Typing indicator */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.0 }}
              className="flex gap-2.5 flex-row-reverse"
            >
              <div className="size-8 rounded-full bg-gradient-to-br from-orange to-orange/70 flex items-center justify-center shrink-0">
                <Bot className="size-4 text-white" />
              </div>
              <div className="bg-gradient-to-br from-orange/10 to-orange/5 border border-orange/20 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-orange animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="size-1.5 rounded-full bg-orange animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="size-1.5 rounded-full bg-orange animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </motion.div>
          </div>

          {/* Footer — live stats bar */}
          <div className="border-t border-border/40 bg-muted/10 px-4 py-3">
            <div className="grid grid-cols-3 gap-3">
              {liveStats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 2.2 + i * 0.1 }}
                  className="text-center"
                >
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <stat.icon className="size-3 text-orange" />
                    <span className="text-[9px] text-muted-foreground font-medium">{stat.label}</span>
                  </div>
                  <div className="text-sm font-bold leading-none">{stat.value}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

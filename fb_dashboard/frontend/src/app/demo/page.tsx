"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"

import { AdminSidebar } from "@/components/layout/AdminSidebar"
import { MobileBottomNav } from "@/components/layout/MobileBottomNav"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

import { cn } from "@/lib/utils"
import { fadeUp, stagger } from "@/lib/motion"
import {
  Bot, MessageCircle, Users, Activity, TrendingUp, Clock,
  Sparkles, ArrowLeft, CheckCircle, Send, Bell, Settings as SettingsIcon,
} from "lucide-react"
import { ActivityBarChart } from "@/components/charts"

/* ═══════════════════════════════════════════════════════════════════════════
 * v4 radical plan §3 — REBUILT on the REAL dashboard architecture.
 *
 * The old page hand-rolled its own sidebar/header tree and drew fake
 * cursor-pointer tabs with no onClick — nothing navigated. This rebuild:
 *   - uses the REAL AdminSidebar + MobileBottomNav (single component source,
 *     same as every authenticated dashboard page)
 *   - sidebar clicks REALLY switch demo tabs (useState<TabKey>) with
 *     different content per tab; unmapped items route to the real funnel
 *   - keeps the "تجربة - بيانات وهمية" badge + subscribe CTA
 *   - tokens are the official single-source set (no orange aliases)
 * ═══════════════════════════════════════════════════════════════════════════ */

type TabKey = "stats" | "replies" | "audience" | "activity" | "analytics" | "schedule" | "settings"

const TAB_META: Record<TabKey, { title: string; subtitle: string; href: string }> = {
  stats: { title: "لوحة البيانات", subtitle: "نظرة عامة على أداء البوت", href: "/dashboard" },
  replies: { title: "الرسائل", subtitle: "صندوق الوارد والردود التلقائية", href: "/dashboard/messages" },
  audience: { title: "الجمهور", subtitle: "المشتركون والمعلقون الأكثر نشاطاً", href: "/dashboard/audience" },
  activity: { title: "سجل النشاطات", subtitle: "كل ما يقوم به البوت لحظة بلحظة", href: "/dashboard/activity" },
  analytics: { title: "التحليلات", subtitle: "اتجاهات النشاط وأفضل القواعد", href: "/dashboard/analytics" },
  schedule: { title: "المجدول", subtitle: "المنشورات المجدولة", href: "/dashboard/scheduled" },
  settings: { title: "الإعدادات", subtitle: "إعدادات الحساب والصفحة", href: "/dashboard/settings" },
}

const HREF_TO_TAB: Record<string, TabKey> = {
  "/dashboard": "stats",
  "/dashboard/messages": "replies",
  "/dashboard/comments": "replies",
  "/dashboard/autoreply": "replies",
  "/dashboard/audience": "audience",
  "/dashboard/leads": "audience",
  "/dashboard/activity": "activity",
  "/dashboard/analytics": "analytics",
  "/dashboard/reports": "analytics",
  "/dashboard/scheduled": "schedule",
  "/dashboard/posts": "schedule",
  "/dashboard/calendar": "schedule",
  "/dashboard/settings": "settings",
  "/dashboard/tools": "settings",
}

const mockStats = {
  replies_today: 327, replies_week: 1284, followers: 12500, rules: 3,
  active_hours: [45, 62, 38, 55, 70, 85, 92, 110, 88, 65, 42, 30, 48, 55, 72, 95, 130, 145, 120, 90, 65, 50, 35, 25],
  recent_replies: [
    { id: 1, commenter: "أحمد سالم", text: "كم سعر المنتج؟", reply: "سعر المنتج 120 د.ل", time: "منذ دقيقتين" },
    { id: 2, commenter: "مريم النفاتي", text: "هل يتوفر توصيل؟", reply: "نعم التوصيل متوفر", time: "منذ 5 دقائق" },
    { id: 3, commenter: "خالد المزوغي", text: "أريد تفاصيل أكثر", reply: "تفضل بزيارة موقعنا", time: "منذ 10 دقائق" },
    { id: 4, commenter: "فاطمة الصغير", text: "ممتاز", reply: "شكراً لك", time: "منذ 15 دقيقة" },
  ],
  rules_data: [
    { name: "سعر", keyword: "سعر", count: 142, status: "active" },
    { name: "توصيل", keyword: "توصيل", count: 89, status: "active" },
    { name: "ترحيب", keyword: "مرحباً", count: 210, status: "active" },
  ],
  conversations: [
    { id: 1, user: "أحمد سالم", last: "كم سعر المنتج؟", unread: 2, time: "10:42" },
    { id: 2, user: "مريم النفاتي", last: "هل يتوفر توصيل؟", unread: 0, time: "10:31" },
    { id: 3, user: "خالد المزوغي", last: "أريد تفاصيل أكثر", unread: 1, time: "09:58" },
  ],
  thread: [
    { from: "user", text: "سلام عليكم" },
    { from: "bot", text: "وعليكم السلام! كيف نساعدك اليوم؟" },
    { from: "user", text: "كم سعر المنتج؟" },
    { from: "bot", text: "سعر المنتج 120 د.ل — والتوصيل مجاني داخل طرابلس." },
  ],
  subscribers: [
    { id: 1, name: "أحمد سالم", platform: "ماسنجر", last: "اليوم", active: true },
    { id: 2, name: "مريم النفاتي", platform: "ماسنجر", last: "أمس", active: true },
    { id: 3, name: "خالد المزوغي", platform: "ماسنجر", last: "3 أيام", active: false },
    { id: 4, name: "فاطمة الصغير", platform: "ماسنجر", last: "الأسبوع الماضي", active: true },
  ],
  logs: [
    { id: 1, time: "10:42", text: "رد آلي على رسالة من أحمد سالم", level: "INFO" },
    { id: 2, time: "10:31", text: "قاعدة «توصيل» طُبّقت على تعليق", level: "INFO" },
    { id: 3, time: "10:15", text: "مزامنة المعجبين: 12,500", level: "INFO" },
    { id: 4, time: "09:58", text: "رسالة جديدة من خالد المزوغي", level: "WARN" },
  ],
  scheduled_posts: [
    { id: 1, text: "عرض خاص على البيتزا — خصم 20% اليوم فقط", at: "الجمعة 18:00", status: "scheduled" },
    { id: 2, text: "افتتاح الفرع الجديد في بنغازي", at: "السبت 12:00", status: "scheduled" },
    { id: 3, text: "عيد ميلادنا السنوي — هدايا للجميع", at: "الأحد 10:00", status: "draft" },
  ],
}

function DemoHeader({ tab }: { tab: TabKey }) {
  const router = useRouter()
  const meta = TAB_META[tab]
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 md:px-6 h-14">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
            <ArrowLeft className="size-4 rtl:-scale-x-100" /> العودة
          </Button>
          <div>
            <h1 className="font-bold text-sm">{meta.title}</h1>
            <p className="text-[11px] text-muted-foreground">{meta.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="warning">تجربة - بيانات وهمية</Badge>
          <span className="hidden sm:flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-success" />
            <span className="text-sm text-success">البوت نشط</span>
          </span>
        </div>
      </div>
    </header>
  )
}

function StatsTab() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {[
          { icon: MessageCircle, value: mockStats.replies_today, label: "ردود اليوم", color: "text-accent-foreground", bg: "bg-accent-foreground/10" },
          { icon: Activity, value: mockStats.replies_week, label: "آخر 7 أيام", color: "text-blue-500", bg: "bg-blue-500/10" },
          { icon: Users, value: mockStats.followers.toLocaleString("ar-LY"), label: "المتابعون", color: "text-green-500", bg: "bg-green-500/10" },
          { icon: Bot, value: mockStats.rules, label: "قواعد نشطة", color: "text-yellow-500", bg: "bg-yellow-500/10" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                {/* v4 plan §4.3 — explicit bg map instead of fragile text→bg string replace */}
                <div className={cn("size-8 rounded-lg flex items-center justify-center", s.bg)}>
                  <s.icon className={cn("size-4", s.color)} />
                </div>
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4 text-accent-foreground" /> النشاط اليومي (24 ساعة)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityBarChart
            height={128}
            data={mockStats.active_hours.map((v, i) => ({ label: `${i}:00`, value: v, hint: `الساعة ${i}:00` }))}
          />
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="size-4 text-accent-foreground" /> آخر الردود
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {mockStats.recent_replies.map((r) => (
              <div key={r.id} className="flex items-start gap-3 px-6 py-3 border-b border-border last:border-0">
                <div className="size-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                  {r.commenter[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.commenter}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.text}</p>
                  <p className="text-xs text-accent-foreground truncate">{r.reply}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{r.time}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="size-4 text-accent-foreground" /> قواعد الرد
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-right p-3 font-medium">القاعدة</th>
                  <th className="text-right p-3 font-medium">الكلمة المفتاحية</th>
                  <th className="text-center p-3 font-medium">الردود</th>
                  <th className="text-center p-3 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {mockStats.rules_data.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="p-3 text-muted-foreground">{r.keyword}</td>
                    <td className="p-3 text-center">{r.count}</td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <CheckCircle className="size-3" /> نشط
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function RepliesTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader className="pb-2"><CardTitle className="text-base">المحادثات</CardTitle></CardHeader>
        <CardContent className="p-0">
          {mockStats.conversations.map((c) => (
            <div key={c.id} className={cn(
              "flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 cursor-pointer transition-colors",
              c.unread ? "bg-accent/30" : "hover:bg-muted/40"
            )}>
              <div className="size-9 rounded-full bg-accent-foreground/10 text-accent-foreground text-xs font-bold flex items-center justify-center shrink-0">
                {c.user[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{c.user}</p>
                <p className="text-xs text-muted-foreground truncate">{c.last}</p>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-[10px] text-muted-foreground">{c.time}</p>
                {c.unread > 0 && (
                  <span className="inline-flex items-center justify-center size-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold mt-0.5">
                    {c.unread}
                  </span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">محادثة: أحمد سالم</CardTitle>
          <CardDescription>الرد الآلي يعمل — الردود تصل خلال ثوانٍ</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 space-y-3 py-4">
          {mockStats.thread.map((m, i) => (
            <div key={i} className={cn("flex", m.from === "bot" ? "justify-start" : "justify-end")}>
              <div className={cn(
                "max-w-[70%] rounded-xl px-4 py-2.5 text-sm",
                m.from === "bot" ? "bg-muted rounded-tr-sm" : "bg-primary text-primary-foreground rounded-tl-sm"
              )}>
                <p>{m.text}</p>
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <input
              disabled
              placeholder="اكتب رداً… (متاح في الحساب الحقيقي)"
              className="flex-1 h-11 rounded-xl border border-input/60 bg-muted/50 px-4 text-sm"
            />
            <Button variant="orange" size="icon" aria-label="إرسال" disabled>
              <Send className="size-4 rtl:-scale-x-100" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function AudienceTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">المشتركون</CardTitle>
        <CardDescription>يتغذّى تلقائياً من محادثات الماسنجر</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {mockStats.subscribers.map((s) => (
          <div key={s.id} className="flex items-center justify-between px-6 py-3 border-b border-border last:border-0">
            <div className="flex items-center gap-3">
              <span className="size-8 rounded-full bg-accent-foreground/10 text-accent-foreground text-[10px] font-bold flex items-center justify-center">
                {s.name.split(" ").map((w) => w[0]).join("")}
              </span>
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-[10px] text-muted-foreground">{s.platform} · آخر تفاعل: {s.last}</p>
              </div>
            </div>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full",
              s.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            )}>
              {s.active ? "نشط" : "غير نشط"}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ActivityTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="size-4 text-accent-foreground" /> سجل النشاطات
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {mockStats.logs.map((l) => (
          <div key={l.id} className="flex items-center gap-3 px-6 py-3 border-b border-border last:border-0 text-sm">
            <span className="text-[10px] text-muted-foreground w-10 shrink-0" dir="ltr">{l.time}</span>
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0",
              l.level === "WARN" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"
            )}>{l.level}</span>
            <p className="truncate">{l.text}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function AnalyticsTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4 text-accent-foreground" /> النشاط الأسبوعي
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityBarChart
            height={160}
            data={mockStats.active_hours.slice(0, 12).map((v, i) => ({ label: `ي${i + 1}`, value: v + 20, hint: `اليوم ${i + 1}` }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">أفضل القواعد</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {mockStats.rules_data.map((r) => (
            <div key={r.name} className="flex items-center justify-between text-sm">
              <span>{r.name}</span>
              <span className="text-muted-foreground">{r.count} رد</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function ScheduleTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="size-4 text-accent-foreground" /> المنشورات المجدولة
        </CardTitle>
        <CardDescription>تُنشر تلقائياً في موعدها</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {mockStats.scheduled_posts.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-6 py-3 border-b border-border last:border-0">
            <Clock className="size-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate">{p.text}</p>
              <p className="text-[10px] text-muted-foreground">{p.at}</p>
            </div>
            <Badge variant={p.status === "scheduled" ? "info" : "secondary"}>
              {p.status === "scheduled" ? "مجدول" : "مسودة"}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function SettingsTab() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="size-4 text-accent-foreground" /> إشعارات تليجرام
          </CardTitle>
          <CardDescription>إشعار فوري عند كل طلب دفع أو اشتراك</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          فعّل توكن BotFather من الإعدادات ليصلك كل حدث لحظة حدوثه.
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SettingsIcon className="size-4 text-accent-foreground" /> ربط الصفحة
          </CardTitle>
          <CardDescription>تويكن الصفحة يُخزَّن مشفّراً</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          اربط صفحة فيسبوك واحدة أو أكثر وابدأ الرد التلقائي فوراً.
        </CardContent>
      </Card>
    </div>
  )
}

const TAB_CONTENT: Record<TabKey, React.ReactNode> = {
  stats: <StatsTab />,
  replies: <RepliesTab />,
  audience: <AudienceTab />,
  activity: <ActivityTab />,
  analytics: <AnalyticsTab />,
  schedule: <ScheduleTab />,
  settings: <SettingsTab />,
}

export default function DemoPage() {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>("stats")

  const handleNavigate = (href: string) => {
    const target = HREF_TO_TAB[href]
    if (target) {
      setTab(target) // REAL tab switch — the old demo never navigated anywhere
      return
    }
    router.push(href) // unmapped sections → the real (auth-gated) funnel
  }

  return (
    /* Same architecture as DashboardShell: fixed real sidebar + content
       column + real mobile bottom nav (v4 plan §3.2 — no parallel UI tree). */
    <div className="flex min-h-screen bg-background" dir="rtl">
      <div className="fixed top-0 right-0 z-30 h-full w-60 hidden md:block" style={{ zIndex: "var(--z-sticky, 30)" }}>
        <AdminSidebar
          onNavigate={handleNavigate}
          onSubscribe={() => router.push("/subscribe")}
          onLogout={() => router.push("/login")}
          activeHref={TAB_META[tab].href}
        />
      </div>

      <div className="flex-1 md:pr-60 flex flex-col pb-16 md:pb-0">
        <DemoHeader tab={tab} />
        <SectionContainer className="py-6 flex-1">
          <motion.div key={tab} variants={stagger} initial="hidden" animate="visible">
            <motion.div variants={fadeUp}>
              {TAB_CONTENT[tab]}
            </motion.div>

            {/* CTA — kept from the original demo (plan §3.2) */}
            <motion.div variants={fadeUp} className="text-center py-8">
              <Card className="max-w-lg mx-auto border-accent-foreground/25 bg-accent-foreground/5 dark:bg-accent-foreground/15">
                <CardContent className="p-8 text-center space-y-4">
                  <Sparkles className="size-10 text-accent-foreground mx-auto" />
                  <CardTitle className="text-xl">استعد لتجربة البوت الحقيقي</CardTitle>
                  <CardDescription className="text-base">
                    اشترك الآن واحصل على ردود تلقائية ذكية لصفحتك
                  </CardDescription>
                  <Button variant="orange" size="lg" onClick={() => router.push("/subscribe")}>
                    ابدأ الاشتراك
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </SectionContainer>
      </div>

      <MobileBottomNav onNavigate={handleNavigate} onLogout={() => router.push("/login")} />
    </div>
  )
}

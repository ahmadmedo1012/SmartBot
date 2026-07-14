"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"

import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { fadeUp, stagger } from "@/lib/motion"
import {
  Bot, MessageCircle, BarChart3, Users, Activity, TrendingUp, Clock,
  Sparkles, ArrowLeft, ChevronLeft, LayoutDashboard, Settings, Shield,
  CheckCircle, XCircle
} from "lucide-react"

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
}

const navItems = [
  { icon: LayoutDashboard, label: "لوحة البيانات", active: true },
  { icon: MessageCircle, label: "الردود", active: false },
  { icon: Users, label: "الجمهور", active: false },
  { icon: Activity, label: "النشاطات", active: false },
  { icon: TrendingUp, label: "التحليلات", active: false },
  { icon: Clock, label: "جدولة", active: false },
  { icon: Settings, label: "الإعدادات", active: false },
]

export default function DemoPage() {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const maxCount = Math.max(...mockStats.active_hours, 1)

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 start-0 z-50 h-full w-64 border-s border-border bg-card transition-transform md:translate-x-0 md:static md:z-auto",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center gap-2 p-4 border-b border-border">
          <div className="size-8 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold text-sm">S</div>
          <div>
            <p className="font-bold text-sm">SmartBot</p>
            <p className="text-xs text-muted-foreground">تجربة حية</p>
          </div>
        </div>
        <nav className="p-3 space-y-1">
          {navItems.map((item, i) => (
            <div key={i} className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer",
              item.active ? "bg-orange-500 text-white font-medium" : "text-muted-foreground hover:bg-muted"
            )}>
              <item.icon className="size-4" />
              {item.label}
              {item.active && <Badge variant="default" className="mr-auto text-[10px] px-1.5 py-0">حية</Badge>}
            </div>
          ))}
        </nav>
        <div className="absolute bottom-4 left-4 right-4">
          <Button className="w-full" size="sm" onClick={() => router.push("/subscribe")}>
            <Sparkles className="size-4" /> ابدأ الاشتراك
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="md:pr-64">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setSidebarOpen(true)}>
                <ChevronLeft className="size-5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
                <ArrowLeft className="size-4" /> العودة
              </Button>
              <Badge variant="warning">تجربة — بيانات وهمية</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-green-500" />
              <span className="text-sm text-green-600">البوت نشط</span>
            </div>
          </div>
        </header>

        <SectionContainer className="py-6">
          <motion.div variants={stagger} initial="hidden" animate="visible">
            {/* Stats */}
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 mb-6">
              {[
                { icon: MessageCircle, value: mockStats.replies_today, label: "ردود اليوم", color: "text-orange-500" },
                { icon: Activity, value: mockStats.replies_week, label: "آخر 7 أيام", color: "text-blue-500" },
                { icon: Users, value: mockStats.followers.toLocaleString(), label: "المتابعون", color: "text-green-500" },
                { icon: Bot, value: mockStats.rules, label: "قواعد نشطة", color: "text-yellow-500" },
              ].map((s, i) => (
                <motion.div key={s.label} variants={fadeUp} custom={i}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn("size-8 rounded-lg flex items-center justify-center", s.color.replace("text", "bg") + "/10")}>
                          <s.icon className={cn("size-4", s.color)} />
                        </div>
                      </div>
                      <p className="text-2xl font-bold">{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Chart */}
            <motion.div variants={fadeUp} custom={4} className="mb-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="size-4 text-orange-500" /> النشاط اليومي (24 ساعة)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-1 h-32">
                    {mockStats.active_hours.map((v, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t bg-orange-500/70 transition-all hover:bg-orange-500"
                          style={{ height: `${(v / maxCount) * 100}%` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                    <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid gap-6 md:grid-cols-2 mb-6">
              {/* Recent replies */}
              <motion.div variants={fadeUp} custom={5}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MessageCircle className="size-4 text-orange-500" /> آخر الردود
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
                          <p className="text-xs text-orange-500 truncate">{r.reply}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">{r.time}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Rules */}
              <motion.div variants={fadeUp} custom={6}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Shield className="size-4 text-orange-500" /> قواعد الرد
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
                              <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle className="size-3" /> نشط
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* CTA */}
            <motion.div variants={fadeUp} custom={7} className="text-center py-8">
              <Card className="max-w-lg mx-auto border-orange-200 bg-orange-50 dark:bg-orange-950/20">
                <CardContent className="p-8 text-center space-y-4">
                  <Sparkles className="size-10 text-orange-500 mx-auto" />
                  <CardTitle className="text-xl">استعد لتجربة البوت الحقيقي</CardTitle>
                  <CardDescription className="text-base">
                    اشترك الآن واحصل على ردود تلقائية ذكية لصفحتك
                  </CardDescription>
                  <Button size="lg" onClick={() => router.push("/subscribe")}>
                    ابدأ الاشتراك
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </SectionContainer>
      </div>
    </div>
  )
}

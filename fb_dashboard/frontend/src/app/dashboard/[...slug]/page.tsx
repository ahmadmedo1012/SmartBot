"use client"

import { useQuery } from "@tanstack/react-query"
import { useParams } from "next/navigation"
import {
  Activity, AlertCircle, RefreshCw, MessageCircle,
  Calendar, BarChart3, Users, Clock, Target, Bot,
  Settings, HelpCircle, Mail,
} from "lucide-react"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { apiFetch } from "@/lib/csrf-client"

function LoadingSkeleton() {
  return (
    <SectionContainer className="py-6 space-y-6">
      <div className="h-7 w-36 bg-muted rounded animate-pulse" />
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4 space-y-2">
            <div className="h-3 w-16 bg-muted rounded animate-pulse" />
            <div className="h-7 w-12 bg-muted rounded animate-pulse" />
          </CardContent></Card>
        ))}
      </div>
    </SectionContainer>
  )
}

function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <SectionContainer className="py-16 text-center">
      <AlertCircle className="size-12 text-muted-foreground mx-auto mb-4" />
      <h2 className="text-lg font-bold mb-1">حدث خطأ في التحميل</h2>
      <p className="text-sm text-muted-foreground mb-4">{message || "تعذر تحميل البيانات"}</p>
      <Button onClick={onRetry}><RefreshCw className="size-4" /> إعادة المحاولة</Button>
    </SectionContainer>
  )
}

// ── Page configs ──
const PAGE_CONFIG: Record<string, {
  title: string; desc: string; icon: any; apiKey: string; apiUrl: string
}> = {
  messages: {
    title: "الرسائل", desc: "صندوق الوارد الموحد", icon: MessageCircle,
    apiKey: "messages", apiUrl: "/api/messages",
  },
  inbox: {
    title: "صندوق الوارد", desc: "المحادثات والرسائل", icon: Mail,
    apiKey: "inbox", apiUrl: "/api/messages",
  },
  calendar: {
    title: "التقويم", desc: "جدولة المنشورات", icon: Calendar,
    apiKey: "calendar", apiUrl: "/api/calendar",
  },
  reports: {
    title: "التقارير", desc: "تحليلات وإحصائيات", icon: BarChart3,
    apiKey: "reports", apiUrl: "/api/analytics/dashboard",
  },
  audience: {
    title: "الجمهور", desc: "تحليل الجمهور", icon: Users,
    apiKey: "audience", apiUrl: "/api/analytics/overview",
  },
  activity: {
    title: "النشاطات", desc: "سجل النشاط", icon: Activity,
    apiKey: "activity", apiUrl: "/api/audit/logs",
  },
  ads: {
    title: "الإعلانات", desc: "إدارة الإعلانات", icon: Target,
    apiKey: "ads", apiUrl: "/api/ads/accounts",
  },
  autoreply: {
    title: "الردود التلقائية", desc: "قواعد الرد الذكية", icon: Bot,
    apiKey: "autoreply", apiUrl: "/api/admin/rules-categories",
  },
  scheduled: {
    title: "جدولة", desc: "المنشورات المجدولة", icon: Clock,
    apiKey: "scheduled", apiUrl: "/api/calendar/month-summary",
  },
  settings: {
    title: "الإعدادات", desc: "إعدادات الحساب", icon: Settings,
    apiKey: "settings", apiUrl: "/api/me",
  },
  support: {
    title: "المساعدة", desc: "الدعم الفني", icon: HelpCircle,
    apiKey: "support", apiUrl: "/api/me",
  },
}

// ── Page Not Found ──
function PageNotFound({ slug }: { slug: string }) {
  return (
    <SectionContainer className="py-16 text-center">
      <HelpCircle className="size-12 text-muted-foreground mx-auto mb-4" />
      <h2 className="text-lg font-bold mb-1">صفحة غير موجودة</h2>
      <p className="text-sm text-muted-foreground mb-2">المسار: /{slug}</p>
      <p className="text-sm text-muted-foreground">هذه الصفحة قيد التطوير</p>
    </SectionContainer>
  )
}

// ── Generic List View ──
function GenericListView({ data }: { data: any; label: string }) {
  if (!data) return <div className="p-6 text-center text-sm text-muted-foreground">بيانات غير كافية</div>
  if (Array.isArray(data) && data.length === 0)
    return <div className="p-6 text-center text-sm text-muted-foreground">لا توجد بيانات بعد</div>
  return (
    <div className="p-6 space-y-3">
      {Array.isArray(data) ? data.slice(0, 20).map((item: any, i: number) => (
        <div key={item.id || i} className="border-b border-border pb-3 last:border-0 text-sm">
          <p className="font-medium">{item.name || item.title || item.label || `#${item.id || i}`}</p>
          {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
        </div>
      )) : (
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
          {JSON.stringify(data, null, 2).slice(0, 2000)}
        </pre>
      )}
    </div>
  )
}

export default function SubDashboardPage() {
  const params = useParams()
  const slugArr = params?.slug as string[] || []
  const slug = slugArr[0] || ""
  const config = PAGE_CONFIG[slug]

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [slug],
    queryFn: config
      ? () => apiFetch(config.apiUrl).then((r) => r.ok ? r.json().catch(() => ({})) : {})
      : () => Promise.resolve(null),
    enabled: !!config,
  })

  if (!config) return <PageNotFound slug={slug} />

  if (error && !isLoading) {
    return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />
  }
  if (isLoading && !data) return <LoadingSkeleton />

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <config.icon className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">{config.title}</h1>
            <p className="text-[11px] text-muted-foreground">{config.desc}</p>
          </div>
        </div>
      </header>

      <SectionContainer className="py-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <config.icon className="size-4 text-muted-foreground" />
              {config.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data ? <GenericListView data={data} label={config.title} /> : null}
          </CardContent>
        </Card>
      </SectionContainer>
    </div>
  )
}

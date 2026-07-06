import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchBotStatus, restartBot, fetchLogs, fetchStats, fetchFacebookSettings } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import {
  RefreshCw, Terminal, Inbox, AlertTriangle, Plug, Clock, Bot, Trash2,
  Settings2, Database, Key, Eye, EyeOff, Server,
  Sun, Moon, Monitor, Cpu, HardDrive, MessageSquare, BookOpen, Eraser,
  Globe, Smartphone
} from "lucide-react"
import { format } from "date-fns"
import { AnimatePresence, motion } from "framer-motion"
import { useRef, useState, useEffect } from "react"
import { useTheme } from "@/components/theme-provider"

const levelBadgeClass = {
  INFO: "border bg-primary/10 text-primary",
  WARNING: "border bg-warning/10 text-warning",
  ERROR: "border bg-destructive/10 text-destructive",
}

function EmptyState({ message, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
      {Icon ? <Icon className="h-12 w-12 text-muted-foreground/40" /> : <Inbox className="h-12 w-12 text-muted-foreground/40" />}
      <p className="text-muted-foreground">{message || "لا توجد سجلات بعد"}</p>
    </div>
  )
}

function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
      <div className="p-3 rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <p className="text-sm text-muted-foreground">{error?.message || "فشل التحميل"}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="ml-1 h-3 w-3" />
        إعادة المحاولة
      </Button>
    </div>
  )
}

const tabItems = [
  { value: "bot", label: "إعدادات البوت", icon: Bot },
  { value: "facebook", label: "فيسبوك", icon: Smartphone },
  { value: "api", label: "إعدادات API", icon: Settings2 },
  { value: "theme", label: "المظهر", icon: Monitor },
  { value: "system", label: "النظام", icon: Server },
]

function FacebookTab() {
  const { data: fbSettings, isLoading, isError, refetch } = useQuery({
    queryKey: ["facebook-settings"],
    queryFn: fetchFacebookSettings,
  })
  const { data: status } = useQuery({
    queryKey: ["bot-status"],
    queryFn: fetchBotStatus,
    refetchInterval: 10000,
  })
  const queryClient = useQueryClient()
  const [newInterval, setNewInterval] = useState("")
  useEffect(() => {
    if (status?.interval) setNewInterval(String(status.interval))
  }, [status?.interval])
  const updateIntervalMut = useMutation({
    mutationFn: async (sec) => {
      const fd = new FormData(); fd.append("interval", String(sec))
      const r = await fetch("/api/bot/interval", { method: "POST", body: fd })
      if (!r.ok) throw new Error("فشل التحديث")
      return r.json()
    },
    onSuccess: (_, sec) => {
      queryClient.invalidateQueries({ queryKey: ["bot-status"] })
      toast.success(`تم تحديث الفاصل الزمني إلى ${sec} ثانية`)
    },
    onError: (e) => toast.error(e.message || "فشل تحديث الفاصل الزمني"),
  })
  if (isLoading) return <div className="flex justify-center py-12"><Skeleton className="h-32 w-full max-w-md rounded-lg" /></div>
  if (isError) return <ErrorState onRetry={() => refetch()} />
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10"><Smartphone className="h-5 w-5 text-primary" /></div>
            <CardTitle className="text-base">اتصال فيسبوك</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant={fbSettings?.connected ? "default" : "destructive"} className="text-sm px-3 py-1 rounded-full">
              <div className={`w-1.5 h-1.5 rounded-full ml-1.5 ${fbSettings?.connected ? "bg-white animate-pulse" : "bg-muted-foreground/30"}`} />
              {fbSettings?.connected ? "متصل" : "غير متصل"}
            </Badge>
          </div>
          {fbSettings?.page_name && (
            <p className="text-sm text-muted-foreground">اسم الصفحة: <span className="text-foreground font-medium">{fbSettings.page_name}</span></p>
          )}
          {fbSettings?.page_id && (
            <p className="text-sm text-muted-foreground">معرف الصفحة: <code className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{fbSettings.page_id}</code></p>
          )}
          <p className="text-sm text-muted-foreground">
            Token: {fbSettings?.has_token
              ? <code className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{fbSettings.token_preview}</code>
              : <Badge variant="destructive" className="text-xs">غير مضبوط</Badge>}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10"><Bot className="h-5 w-5 text-primary" /></div>
            <CardTitle className="text-base">حالة البوت</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant={status?.running ? "default" : "destructive"} className="text-sm px-3 py-1 rounded-full">
              <div className={`w-1.5 h-1.5 rounded-full ml-1.5 ${status?.running ? "bg-white animate-pulse" : "bg-muted-foreground/30"}`} />
              {status?.running ? "شغال" : "متوقف"}
            </Badge>
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              الفحص كل: {status?.interval ?? 10} ثانية
            </span>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">الفاصل الزمني (ثواني)</label>
              <Input type="number" min={1} value={newInterval} onChange={e => setNewInterval(e.target.value)} className="h-9" />
            </div>
            <Button variant="outline" size="sm" onClick={() => { const sec = parseInt(newInterval); if (!sec || sec < 1) { toast.error("أدخل رقماً صالحاً"); return } updateIntervalMut.mutate(sec) }} disabled={updateIntervalMut.isPending} className="mt-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ml-1 ${updateIntervalMut.isPending ? "animate-spin" : ""}`} />
              تحديث
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function Settings({ role }) {
  useEffect(() => { document.title = "الإعدادات | SmartBot" }, [])
  const queryClient = useQueryClient()
  const [tab, setTab] = useState("bot")
  const { setTheme, resolvedTheme } = useTheme()
  const [showSecrets, setShowSecrets] = useState(false)
  const [newInterval, setNewInterval] = useState("")

  const { data: status, isLoading: statusLoading, isError: statusError, refetch: refetchStatus } = useQuery({
    queryKey: ["bot-status"],
    queryFn: fetchBotStatus,
    refetchInterval: 10000, refetchIntervalInBackground: false,
  })

  const { data: logs = [], isLoading: logsLoading, isError: logsError, refetch: refetchLogs } = useQuery({
    queryKey: ["logs"],
    queryFn: () => fetchLogs(50),
    enabled: tab === "bot",
  })

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: fetchStats,
    enabled: tab === "system",
  })

  const logsEndRef = useRef(null)
  const logsContainerRef = useRef(null)
  const [cleared, setCleared] = useState(false)

  useEffect(() => {
    if (logsEndRef.current && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
    }
  }, [logs])

  useEffect(() => {
    if (status?.interval) setNewInterval(String(status.interval))
  }, [status?.interval])

  const restartMut = useMutation({
    mutationFn: restartBot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bot-status"] })
      toast.success("تم إعادة تشغيل البوت بنجاح")
    },
    onError: (e) => toast.error(e.message),
  })

  const updateIntervalMut = useMutation({
    mutationFn: async (sec) => {
      const fd = new FormData(); fd.append("interval", String(sec))
      const r = await fetch("/api/bot/interval", { method: "POST", body: fd })
      if (!r.ok) throw new Error("فشل التحديث")
      return r.json()
    },
    onSuccess: (_, sec) => {
      queryClient.invalidateQueries({ queryKey: ["bot-status"] })
      toast.success(`تم تحديث الفاصل الزمني إلى ${sec} ثانية`)
    },
    onError: (e) => toast.error(e.message || "فشل تحديث الفاصل الزمني"),
  })

  const clearLogsMut = useMutation({
    mutationFn: async () => {
      setCleared(true); return { ok: true }
    },
  })

  const envConfig = [
    { key: "DATABASE_URL", value: "postgresql://user:***@host:5432/smartbot", hidden: true, showPartial: true },
    { key: "SECRET_KEY", value: "******************************", hidden: true, showPartial: false },
    { key: "FACEBOOK_ACCESS_TOKEN", value: "EAAx...****", hidden: true, showPartial: false },
  ]

  const systemStats = [
    { label: "الإصدار", value: stats?.version || "0.0.0", icon: HardDrive },
    { label: "React", value: "19.2.7", icon: Cpu },
    { label: "عدد القواعد", value: stats?.rules_count ?? "—", icon: BookOpen },
    { label: "عدد الردود", value: stats?.replies_count ?? "—", icon: MessageSquare },
    { label: "حجم قاعدة البيانات", value: stats?.db_size || "—", icon: Database },
    { label: "حالة البوت", value: status?.running ? "شغال" : "متوقف", icon: Bot },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">الإعدادات</h1>
        <p className="text-sm text-muted-foreground mt-1">إعدادات البوت، API، المظهر وإحصائيات النظام</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-5">
        <TabsList className="w-full justify-start gap-1 bg-transparent p-0 h-auto">
          {tabItems.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-2.5 text-sm gap-2"
            >
              <Icon className="h-4 w-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {tab === "bot" && (
              <div className="space-y-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-primary/10">
                          <Bot className="h-5 w-5 text-primary" />
                        </div>
                        <CardTitle className="text-base">حالة البوت</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {statusLoading ? (
                        <div className="space-y-3">
                          <Skeleton className="h-8 w-40 rounded-lg" />
                          <Skeleton className="h-9 w-32 rounded-lg" />
                          <Skeleton className="h-9 w-full rounded-lg" />
                        </div>
                      ) : statusError ? (
                        <ErrorState onRetry={() => refetchStatus()} />
                      ) : (
                        <>
                          <div className="flex items-center gap-3">
                            <Badge variant={status?.running ? "default" : "destructive"} className="text-sm px-3 py-1 rounded-full">
                              <div className={`w-1.5 h-1.5 rounded-full ml-1.5 ${status?.running ? "bg-white animate-pulse" : "bg-muted-foreground/30"}`} />
                              {status?.running ? "شغال" : "متوقف"}
                            </Badge>
                            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5" />
                              الفحص كل: {status?.interval ?? 10} ثانية
                            </span>
                          </div>
                          <div className="flex items-end gap-3">
                            <div className="flex-1 space-y-1.5">
                              <label className="text-xs text-muted-foreground font-medium">الفاصل الزمني (ثواني)</label>
                              <Input type="number" min={1} value={newInterval} onChange={e => setNewInterval(e.target.value)} className="h-9" />
                            </div>
                            <Button variant="outline" size="sm"
                              onClick={() => { const sec = parseInt(newInterval); if (!sec || sec < 1) { toast.error("أدخل رقماً صالحاً"); return } updateIntervalMut.mutate(sec) }}
                              disabled={updateIntervalMut.isPending}
                              className="mt-1.5">
                              <RefreshCw className={`h-3.5 w-3.5 ml-1 ${updateIntervalMut.isPending ? "animate-spin" : ""}`} />
                              تحديث
                            </Button>
                          </div>
                          <div className="flex items-center gap-3 pt-1">
                            <Button variant="destructive" size="sm"
                              onClick={() => restartMut.mutate()}
                              disabled={restartMut.isPending || role !== "admin"}
                              className={role !== "admin" ? "opacity-50 cursor-not-allowed" : ""}>
                              <RefreshCw className={`h-4 w-4 ml-1.5 ${restartMut.isPending ? "animate-spin" : ""}`} />
                              {restartMut.isPending ? "جاري..." : "إعادة تشغيل البوت"}
                            </Button>
                            {role !== "admin" && <span className="text-xs text-muted-foreground">متاح للمدير فقط</span>}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-primary/10">
                          <Plug className="h-5 w-5 text-primary" />
                        </div>
                        <CardTitle className="text-base">اتصال فيسبوك</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {statusLoading ? (
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-48 rounded-lg" />
                          <Skeleton className="h-4 w-32 rounded-lg" />
                        </div>
                      ) : statusError ? (
                        <ErrorState onRetry={() => refetchStatus()} />
                      ) : !status ? null : (
                        <>
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">معرف الصفحة:</span>{" "}
                            <code className="px-2 py-0.5 bg-muted rounded text-xs font-mono">مُعد في الإعدادات</code>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-foreground">الحالة:</span>
                            <Badge variant={status.running ? "default" : "secondary"} className="text-xs rounded-full">
                              <div className={`w-1.5 h-1.5 rounded-full ml-1.5 ${status.running ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                              {status.running ? "متصل" : "غير متصل"}
                            </Badge>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-primary/10">
                        <Terminal className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-base">سجل البوت</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {logsLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div key={i} className="flex items-center gap-3">
                            <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
                            <Skeleton className="h-5 w-16 shrink-0 rounded" />
                            <Skeleton className="h-5 w-full rounded" />
                          </div>
                        ))}
                      </div>
                    ) : logsError ? (
                      <ErrorState onRetry={() => refetchLogs()} />
                    ) : logs.length === 0 || cleared ? (
                      <EmptyState message="لا توجد سجلات بعد" />
                    ) : (
                      <div className="relative">
                        <div ref={logsContainerRef} className="space-y-1 max-h-80 overflow-y-auto" dir="ltr">
                          {logs.map((log, i) => (
                            <div key={log.id ?? i}
                              className="flex items-start gap-2 text-sm py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${levelBadgeClass[log.level] ?? "bg-muted text-muted-foreground"}`}>
                                {log.level}
                              </span>
                              <span className="text-muted-foreground text-xs shrink-0 font-mono" dir="ltr">
                                {log.created_at ? format(new Date(log.created_at), "HH:mm:ss") : "—"}
                              </span>
                              <span className="break-words text-foreground">{log.message}</span>
                            </div>
                          ))}
                          <div ref={logsEndRef} />
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t mt-1">
                          <Button variant="outline" size="sm" onClick={() => clearLogsMut.mutate()} disabled={clearLogsMut.isPending} className="text-xs">
                            <Eraser className="h-3 w-3 ml-1" />
                            {clearLogsMut.isPending ? "جاري..." : "تنظيف السجلات القديمة"}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setCleared(true)} className="text-xs">
                            <Trash2 className="h-3 w-3 ml-1" />
                            مسح السجلات
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {tab === "facebook" && (
              <FacebookTab />
            )}

            {tab === "api" && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <Settings2 className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">إعدادات API</CardTitle>
                  </div>
                  <CardDescription>متغيرات البيئة — للقراءة فقط</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-lg border divide-y">
                    {envConfig.map(({ key, value, hidden, showPartial }) => (
                      <div key={key} className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-1.5 rounded-lg bg-muted shrink-0">
                            {key.startsWith("DATABASE") ? <Database className="h-4 w-4 text-muted-foreground" /> :
                             key.startsWith("SECRET") ? <Key className="h-4 w-4 text-muted-foreground" /> :
                             <Globe className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{key}</p>
                            <p className="text-xs text-muted-foreground font-mono truncate max-w-[260px] sm:max-w-md" dir="ltr">
                              {showSecrets || !hidden ? value : showPartial ? "postgresql://...****" : "****************"}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setShowSecrets(v => !v)}>
                          {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30">
                    <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                    <div className="text-sm text-warning">
                      <p className="font-medium">تعديل هذه الإعدادات</p>
                      <p className="mt-1">تتم إدارة متغيرات البيئة من خلال لوحة تحكم Render Dashboard.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {tab === "theme" && (
              <div className="grid gap-5 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-primary/10">
                        <Monitor className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-base">المظهر</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">اختر نمط العرض:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button onClick={() => setTheme("light")}
                          className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${resolvedTheme === "light" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                          <Sun className={`h-8 w-8 ${resolvedTheme === "light" ? "text-primary" : "text-muted-foreground"}`} />
                          <span className={`text-sm font-medium ${resolvedTheme === "light" ? "text-primary" : ""}`}>فاتح</span>
                        </button>
                        <button onClick={() => setTheme("dark")}
                          className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${resolvedTheme === "dark" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                          <Moon className={`h-8 w-8 ${resolvedTheme === "dark" ? "text-primary" : "text-muted-foreground"}`} />
                          <span className={`text-sm font-medium ${resolvedTheme === "dark" ? "text-primary" : ""}`}>داكن</span>
                        </button>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">الحالي</span>
                      <Badge variant="outline" className="gap-1.5">
                        {resolvedTheme === "dark" ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
                        {resolvedTheme === "dark" ? "داكن" : "فاتح"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-primary/10">
                        <Eye className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-base">معاينة حية</CardTitle>
                    </div>
                    <CardDescription>معاينة المظهر المختار</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className={`rounded-lg border overflow-hidden transition-colors duration-300`}>
                      <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-primary" />
                          <div className="h-2 w-20 rounded bg-muted" />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          {[1,2,3,4].map(i => <div key={i} className="h-8 rounded bg-muted" />)}
                        </div>
                        <div className="h-3 w-32 rounded bg-muted" />
                        <div className="h-3 w-24 rounded bg-muted" />
                        <div className="h-8 w-full rounded-lg bg-primary flex items-center justify-center">
                          <span className="text-primary-foreground text-xs font-medium">زر تجريبي</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {tab === "system" && (
              <div className="space-y-5">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-primary/10">
                        <Server className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-base">إحصائيات النظام</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {statsLoading ? (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1,2,3,4,5,6].map(i => <div key={i} className="p-4 rounded-lg border space-y-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-7 w-24" /></div>)}
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {systemStats.map(({ label, value, icon: Icon }) => (
                          <div key={label} className="p-4 rounded-lg border">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1.5">
                              <Icon className="h-3.5 w-3.5" />{label}
                            </div>
                            <p className="text-lg font-semibold font-mono text-foreground">{value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-primary/10">
                        <Eraser className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-base">صيانة</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">تنظيف السجلات التي مضى عليها أكثر من 30 يوماً.</p>
                    <Button variant="outline" onClick={() => clearLogsMut.mutate()} disabled={clearLogsMut.isPending}>
                      <Eraser className={`h-4 w-4 ml-1.5 ${clearLogsMut.isPending ? "animate-pulse" : ""}`} />
                      {clearLogsMut.isPending ? "جاري التنظيف..." : "تنظيف السجلات القديمة"}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </Tabs>
    </motion.div>
  )
}

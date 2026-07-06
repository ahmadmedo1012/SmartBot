import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchFacebookSettings, fetchBotStatus, restartBot } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { Square, RefreshCw, Bot, Smartphone, WifiOff, CheckCircle2 } from "lucide-react"
import { motion } from "framer-motion"
import { useEffect, useState } from "react"

const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } }
const itemVariants = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }

export function FbControl({ role }) {
  useEffect(() => { document.title = "التحكم في البوت | SmartBot" }, [])
  const isAdmin = role === "admin"
  const queryClient = useQueryClient()
  const [interval, setInterval] = useState("10")

  const { data: settings, isLoading: settLoading } = useQuery({
    queryKey: ["facebook-settings"], queryFn: fetchFacebookSettings,
  })
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["bot-status"], queryFn: fetchBotStatus, refetchInterval: 5000, refetchIntervalInBackground: false,
  })

  useEffect(() => {
    if (status?.interval) setInterval(String(status.interval))
  }, [status?.interval])

  const restartMut = useMutation({
    mutationFn: restartBot,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bot-status"] }); toast.success("تم إعادة تشغيل البوت") },
    onError: (e) => toast.error(e.message),
  })
  const stopMut = useMutation({
    mutationFn: () => fetch("/api/bot/stop", { method: "POST" }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bot-status"] }); toast.success("تم إيقاف البوت") },
    onError: (e) => toast.error(e.message),
  })
  const intervalMut = useMutation({
    mutationFn: async (sec) => {
      const fd = new FormData(); fd.append("interval", String(sec))
      const r = await fetch("/api/bot/interval", { method: "POST", body: fd })
      if (!r.ok) throw new Error("فشل التحديث")
      return r.json()
    },
    onSuccess: (_, sec) => { queryClient.invalidateQueries({ queryKey: ["bot-status"] }); toast.success(`تم تغيير الفاصل إلى ${sec} ثانية`) },
    onError: (e) => toast.error(e.message),
  })
  const connected = settings?.connected ?? status?.running ?? false

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Bot className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">التحكم في البوت</h1>
            <p className="text-sm text-muted-foreground mt-1">إدارة البوت التلقائي واتصال فيسبوك</p>
          </div>
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10"><Bot className="h-5 w-5 text-primary" /></div>
              <CardTitle className="text-base">حالة البوت</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <div className="space-y-3"><Skeleton className="h-6 w-32 rounded-lg" /><Skeleton className="h-9 w-full rounded-lg" /></div>
            ) : !status ? (
              <p className="text-sm text-muted-foreground">تعذر تحميل الحالة</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Badge variant={status.running ? "default" : "destructive"} className="text-sm px-3 py-1.5 rounded-full">
                    <span className={`w-2 h-2 rounded-full ml-1.5 ${status.running ? "bg-success animate-pulse" : "bg-muted-foreground/30"}`} />
                    {status.running ? "شغال" : "متوقف"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">الفحص كل {status.interval} ثانية</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => restartMut.mutate()}
                    disabled={restartMut.isPending || !isAdmin}
                    variant={status.running ? "secondary" : "default"}
                  >
                    <RefreshCw className={`ml-1.5 h-4 w-4 ${restartMut.isPending ? "animate-spin" : ""}`} />
                    إعادة تشغيل
                  </Button>
                  <Button
                    onClick={() => stopMut.mutate()}
                    disabled={stopMut.isPending || !status.running || !isAdmin}
                    variant="destructive"
                  >
                    <Square className="ml-1.5 h-4 w-4" />
                    إيقاف
                  </Button>
                </div>
                <div className="flex items-end gap-3 pt-2">
                  <div className="space-y-1.5 flex-1 max-w-xs">
                    <label className="text-xs text-muted-foreground font-medium">فاصل التدقيق (ثواني)</label>
                    <Input type="number" min={3} max={3600} value={interval}
                      onChange={e => setInterval(e.target.value)} className="h-9" />
                  </div>
                  <Button variant="outline" size="sm"
                    onClick={() => { const v = parseInt(interval); if (!v || v < 3) { toast.error("اقل من 3 ثواني غير مسموح"); return } intervalMut.mutate(v) }}
                    disabled={intervalMut.isPending || !isAdmin}
                  >تحديث</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10"><Smartphone className="h-5 w-5 text-primary" /></div>
              <CardTitle className="text-base">اتصال فيسبوك</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {settLoading ? (
              <div className="space-y-3"><Skeleton className="h-6 w-32 rounded-lg" /><Skeleton className="h-4 w-48 rounded-lg" /></div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Badge variant={connected ? "default" : "destructive"} className="text-sm px-3 py-1 rounded-full">
                    <span className={`w-2 h-2 rounded-full ml-1.5 ${connected ? "bg-success animate-pulse" : "bg-muted-foreground/30"}`} />
                    {connected ? "متصل" : "غير متصل"}
                  </Badge>
                  {connected ? <CheckCircle2 className="h-4 w-4 text-success" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1"><p className="text-muted-foreground text-xs">معرف الصفحة</p><p className="font-mono font-medium text-foreground">{settings?.page_id || "—"}</p></div>
                  <div className="space-y-1"><p className="text-muted-foreground text-xs">اسم الصفحة</p><p className="font-medium text-foreground">{settings?.page_name || "—"}</p></div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}

import { useQuery, useMutation } from "@tanstack/react-query"
import { fetchWebhookCheck, fetchWebhookEvents, triggerWebhookTest } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  RefreshCw, AlertTriangle, Globe, CheckCircle2, XCircle,
  Send, Clock, Activity, BookOpen
} from "lucide-react"
import { format } from "date-fns"
import { motion } from "framer-motion"
import { useEffect } from "react"

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

export function Webhook() {
  useEffect(() => { document.title = "الويب هوك | SmartBot" }, [])

  const { data: check, isLoading: checkLoading, isError: checkError, refetch: refetchCheck } = useQuery({
    queryKey: ["webhook-check"],
    queryFn: fetchWebhookCheck,
  })

  const { data: events = [], isLoading: eventsLoading, isError: eventsError, refetch: refetchEvents } = useQuery({
    queryKey: ["webhook-events"],
    queryFn: () => fetchWebhookEvents(20),
  })

  const testMut = useMutation({
    mutationFn: triggerWebhookTest,
    onSuccess: () => {
      toast.success("تم تشغيل اختبار الويب هوك")
      refetchEvents()
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">الويب هوك</h1>
        <p className="text-sm text-muted-foreground mt-1">إعدادات واستقبال أحداث Webhook من فيسبوك</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">حالة الاتصال</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {checkLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-48 rounded-lg" />
                <Skeleton className="h-5 w-36 rounded-lg" />
                <Skeleton className="h-5 w-64 rounded-lg" />
              </div>
            ) : checkError ? (
              <ErrorState onRetry={() => refetchCheck()} />
            ) : check ? (
              <>
                <div className="flex items-center gap-3">
                  <Badge variant={check.configured ? "default" : "destructive"} className="text-sm px-3 py-1 rounded-full">
                    {check.configured
                      ? <><CheckCircle2 className="h-3.5 w-3.5 ml-1" />مُعد</>
                      : <><XCircle className="h-3.5 w-3.5 ml-1" />غير مُعد</>}
                  </Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">الرابط:</span>
                    <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono truncate max-w-[280px]" dir="ltr">
                      {check.webhook_url}
                    </code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">رمز التحقق:</span>
                    <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                      {check.verify_token}
                    </code>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testMut.mutate()}
                  disabled={testMut.isPending}
                >
                  <Send className={`h-3.5 w-3.5 ml-1.5 ${testMut.isPending ? "animate-pulse" : ""}`} />
                  {testMut.isPending ? "جاري..." : "اختبار الويب هوك"}
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base">تعليمات الإعداد</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
              <li>اذهب إلى <code className="text-xs bg-muted px-1 rounded">developers.facebook.com/apps</code></li>
              <li>اختر تطبيقك ← Webhooks ← Page</li>
              <li>ضع رابط الويب هوك في <strong className="text-foreground">Callback URL</strong></li>
              <li>ضع رمز التحقق في <strong className="text-foreground">Verify Token</strong></li>
              <li>اشترك في حقل <strong className="text-foreground">feed</strong></li>
              <li>اضغط "اختبار الويب هوك" للتحقق</li>
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-base">سجل الأحداث</CardTitle>
          </div>
          <CardDescription>آخر 20 حدث من الويب هوك</CardDescription>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : eventsError ? (
            <ErrorState onRetry={() => refetchEvents()} />
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <Activity className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground">لا توجد أحداث ويب هوك بعد</p>
            </div>
          ) : (
            <div className="rounded-lg border divide-y">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 p-3 text-sm">
                  <Badge variant="outline" className="text-xs shrink-0 font-mono">
                    <Clock className="h-3 w-3 ml-1" />
                    {ev.created_at ? format(new Date(ev.created_at), "HH:mm:ss") : "—"}
                  </Badge>
                  <span className="text-foreground break-words">{ev.message}</span>
                  <Badge className={`text-xs shrink-0 ${ev.level === "ERROR" ? "bg-destructive/10 text-destructive" : ev.level === "WARNING" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}>
                    {ev.level}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

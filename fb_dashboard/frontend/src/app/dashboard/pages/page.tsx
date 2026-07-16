"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { toast } from "sonner"
import {
  FileText, Link2, CheckCircle2, XCircle, RefreshCw, AlertCircle, Loader2, HelpCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function PagesPage() {
  const [pageId, setPageId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["facebook-settings"],
    queryFn: async () => {
      const res = await apiFetch("/api/facebook/settings")
      if (!res.ok) throw new Error(`فشل التحميل (${res.status})`)
      return res.json()
    },
    retry: 1,
  })

  const handleSave = async () => {
    if (!pageId.trim() || !accessToken.trim()) {
      toast.error("يرجى إدخال معرف الصفحة ورمز الوصول")
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch("/api/facebook/settings", {
        method: "PUT",
        body: JSON.stringify({ page_id: pageId.trim(), access_token: accessToken.trim(), subscribe_webhook: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.detail || "فشل الحفظ")
      queryClient.invalidateQueries({ queryKey: ["facebook-settings"] })
      toast.success("تم حفظ بيانات فيسبوك والاشتراك في webhook")
    } catch (e: any) {
      toast.error(e.message || "فشل الحفظ")
    }
    setSaving(false)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await apiFetch("/api/facebook/test", { method: "POST" })
      const json = await res.json()
      setTestResult(json)
      if (json.connected) {
        toast.success(`اتصال ناجح · ${json.fan_count} متابع`)
      } else {
        toast.error(json.error || "فشل الاتصال")
      }
    } catch (e: any) {
      setTestResult({ connected: false, error: e.message })
      toast.error(e.message || "فشل الاختبار")
    }
    setTesting(false)
  }

  const connected = data?.connected

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-9 rounded-lg bg-orange/10 flex items-center justify-center">
            <FileText className="size-4 text-orange" />
          </div>
          <div>
            <h1 className="font-bold text-sm">الصفحات</h1>
            <p className="text-[11px] text-muted-foreground">ربط وإدارة صفحات فيسبوك</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6" dir="rtl">
        {isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-red-500/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل الإعدادات</h2>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : isLoading ? (
          <Card><CardContent className="p-6 flex items-center gap-4">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">جاري التحميل...</span>
          </CardContent></Card>
        ) : (
          <>
          {/* Current status */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className={`size-10 rounded-lg flex items-center justify-center ${connected ? "bg-green-500/10" : "bg-muted"}`}>
                  {connected ? <CheckCircle2 className="size-5 text-green-500" /> : <XCircle className="size-5 text-muted-foreground" />}
                </div>
                <div>
                  <p className="font-bold text-sm">{connected ? "صفحة متصلة" : "غير متصل"}</p>
                  <p className="text-xs text-muted-foreground">{data?.page_id ? `المعرف: ${data.page_id}` : "لم يتم ربط أي صفحة بعد"}</p>
                </div>
              </div>
              {connected && data?.page_id && (
                <Button size="sm" variant="outline" onClick={handleTest} disabled={testing}>
                  {testing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                  اختبار الاتصال
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Test result */}
          {testResult && (
            <Card>
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center gap-2">
                  {testResult.connected
                    ? <CheckCircle2 className="size-4 text-green-500" />
                    : <XCircle className="size-4 text-red-500" />}
                  <span className="text-sm font-bold">{testResult.connected ? "اتصال ناجح" : "فشل الاتصال"}</span>
                </div>
                {testResult.connected && (
                  <>
                    <p className="text-sm">{testResult.fan_count?.toLocaleString()} متابع</p>
                    {testResult.scopes?.scopes && (
                      <div className="flex flex-wrap gap-1">
                        {testResult.scopes.scopes.map((s: string) => (
                          <Badge key={s} variant="info" className="text-[10px]">{s}</Badge>
                        ))}
                      </div>
                    )}
                    {testResult.warning && (
                      <p className="text-xs text-yellow-500">{testResult.warning}</p>
                    )}
                  </>
                )}
                {testResult.error && (
                  <p className="text-xs text-red-500">{testResult.error}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Connection form */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-bold text-sm">ربط صفحة فيسبوك جديدة</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">معرف الصفحة (Page ID)</label>
                  <Input value={pageId} onChange={e => setPageId(e.target.value)} placeholder="أدخل معرف الصفحة من فيسبوك" className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">رمز الوصول (Access Token)</label>
                  <Input value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="أدخل رمز الوصول" className="h-9 text-sm font-mono" />
                </div>
                <Button onClick={handleSave} disabled={!pageId.trim() || !accessToken.trim() || saving} className="w-full">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                  حفظ وربط الصفحة
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Help */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <HelpCircle className="size-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>تحتاج إلى رمز وصول من فيسبوك مع الصلاحيات التالية:</p>
                  <ul className="list-disc pr-4 space-y-0.5">
                    <li>pages_messaging</li>
                    <li>pages_manage_metadata</li>
                    <li>pages_read_engagement</li>
                  </ul>
                  <p className="mt-2">بعد الحفظ، سيتم الاشتراك في webhook تلقائياً لتلقي التعليقات والرسائل.</p>
                </div>
              </div>
            </CardContent>
          </Card>
          </>
        )}
      </div>
    </div>
  )
}

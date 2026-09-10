"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import {
  FileText, Link2, CheckCircle2, XCircle, RefreshCw, AlertCircle, Loader2, HelpCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/ui/PageHeader"
import { unwrapApi } from "@/lib/api"
import type { FacebookSettings, FacebookTestResult } from "@/lib/types"
import { formatNumber } from "@/lib/format"

export default function PagesPage() {
  const [pageId, setPageId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<FacebookTestResult | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["facebook-settings"],
    queryFn: async () => {
      const res = await apiFetch("/api/facebook/settings")
      if (!res.ok) throw new Error(`فشل التحميل (${res.status})`)
      return unwrapApi<FacebookSettings>(res)
    },
    retry: 1,
  })

  const handleSave = async () => {
    if (!pageId.trim() || !accessToken.trim()) {
      brandedToast.error("يرجى إدخال معرف الصفحة ورمز الوصول")
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
      brandedToast.success("تم حفظ بيانات فيسبوك والاشتراك في الويبهوك")
    } catch (e) {
      brandedToast.error((e as Error).message || "فشل الحفظ")
    }
    setSaving(false)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await apiFetch("/api/facebook/test", { method: "POST" })
      const json = await unwrapApi<FacebookTestResult>(res)
      setTestResult(json)
      /* v20: the backend exchanged a stored USER token for the PAGE token
       * and persisted it — refresh the settings block (name/verdict) so the
       * page reflects the repaired state without a manual reload. */
      if (json.token_exchanged) {
        brandedToast.success("تم اكتشاف رمز مستخدم واستبداله برمز صفحة تلقائياً")
        queryClient.invalidateQueries({ queryKey: ["facebook-settings"] })
      }
      if (json.connected) {
        brandedToast.success(`تم الاتصال — متابعو الصفحة: ${formatNumber(json.fan_count)}`)
      } else {
        brandedToast.error(json.error || "فشل الاتصال")
      }
    } catch (e) {
      setTestResult({ connected: false, error: (e as Error).message })
      brandedToast.error((e as Error).message || "فشل الاختبار")
    }
    setTesting(false)
  }

  const connected = data?.connected

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي. */}
      <PageHeader
        icon={<FileText className="size-4" />}
        title="الصفحات"
        subtitle="ربط وإدارة صفحات فيسبوك"
        compact
      />

      {/* D4-بند2 — قرار سقف العرض الموحد: max-w-5xl (1024px) + mx-auto. */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full" dir="rtl">
        {isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-destructive/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل الإعدادات</h2>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : isLoading ? (
          <Card><CardContent className="p-6 flex items-center gap-4">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">جارٍ التحميل…</span>
          </CardContent></Card>
        ) : (
          <>
          {/* Current status */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className={`size-10 rounded-lg flex items-center justify-center ${connected ? "bg-success-soft" : "bg-muted"}`}>
                  {connected ? <CheckCircle2 className="size-5 text-success" /> : <XCircle className="size-5 text-muted-foreground" />}
                </div>
                <div>
                  <p className="font-bold text-sm">{connected ? (data?.page_name || "صفحة متصلة") : "غير متصلة"}</p>
                  <p className="text-xs text-muted-foreground">{data?.page_id ? `المعرف: ${data.page_id}` : "لم يتم ربط أي صفحة بعد"}</p>
                </div>
              </div>
              {/* v20 §5.2 — a known-bad stored token gets a loud banner, not
                  a silently-empty dashboard (verdict from the self-heal). */}
              {connected && data?.token_ok === false && data.token_check && (
                <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                  <div className="leading-relaxed">
                    <p className="font-medium text-destructive">تعذّر الاتصال بصفحة فيسبوك</p>
                    <p className="mt-1 text-xs text-destructive/85">
                      {data.token_check.detail || "الرمز المخزّن لا يعمل مع بيانات الصفحة — أعد إدخال رمز الوصول أدناه."}
                    </p>
                  </div>
                </div>
              )}
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
                    ? <CheckCircle2 className="size-4 text-success" />
                    : <XCircle className="size-4 text-destructive" />}
                  <span className="text-sm font-bold">{testResult.connected ? "اتصال ناجح" : "فشل الاتصال"}</span>
                </div>
                {testResult.connected && (
                  <>
                    <p className="text-sm">متابعو الصفحة: {formatNumber(testResult.fan_count)}</p>
                    {testResult.token_type && (
                      <p className="text-xs text-muted-foreground">
                        نوع الرمز: {testResult.token_type === "page" ? "رمز صفحة (سليم)" : testResult.token_type === "user" ? "رمز مستخدم (تم الاستبدال أو يحتاج استبدالاً)" : "غير معروف"}
                      </p>
                    )}
                    {testResult.scopes?.scopes && (
                      <div className="flex flex-wrap gap-1">
                        {testResult.scopes.scopes.map((s: string) => (
                          <Badge key={s} variant="info" className="text-3xs">{s}</Badge>
                        ))}
                      </div>
                    )}
                    {testResult.warning && (
                      <p className="text-xs text-warning">{testResult.warning}</p>
                    )}
                  </>
                )}
                {testResult.error && (
                  <p className="text-xs text-destructive">{testResult.error}</p>
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
                  <label htmlFor="fb-page-id" className="text-xs text-muted-foreground mb-1 block">معرف الصفحة (Page ID)</label>
                  <Input id="fb-page-id" value={pageId} onChange={e => setPageId(e.target.value)} placeholder="أدخل معرف الصفحة من فيسبوك" className="h-9 text-sm" />
                </div>
                <div>
                  <label htmlFor="fb-access-token" className="text-xs text-muted-foreground mb-1 block">رمز الوصول (Access Token)</label>
                  <Input id="fb-access-token" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="أدخل رمز الوصول" className="h-9 text-sm font-mono" />
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
                  <ul className="list-disc ps-4 space-y-0.5">
                    <li>pages_messaging</li>
                    <li>pages_manage_metadata</li>
                    <li>pages_read_engagement</li>
                  </ul>
                  <p className="mt-2">بعد الحفظ، سيتم الاشتراك في الويبهوك تلقائياً لتلقي التعليقات والرسائل.</p>
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

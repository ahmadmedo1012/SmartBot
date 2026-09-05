"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { apiFetch } from "@/lib/csrf-client"
import { Settings, User, Shield, Mail, Lock, KeyRound, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/PageHeader"
import { LoadingState, ErrorState } from "@/components/ui/EmptyState"
import { unwrapApi } from "@/lib/api"

export default function SettingsPage() {
  const { data: raw, isLoading, isError, refetch } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => apiFetch("/api/me").then(unwrapApi),
  })
  // v4 §2.3 — unwrapApi already returned /api/me's payload ({user: {...}});
  // the old raw?.data fallback made username/email/role blank forever
  const user = raw?.user ?? raw?.data?.user ?? raw

  // Self-service password change (plan v3 §7c — the الأمان card was a
  // decorative shell; the endpoint existed but had no UI).
  const [showPw, setShowPw] = useState(false)
  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [pwBusy, setPwBusy] = useState(false)

  const changePassword = async () => {
    if (newPw.length < 8) {
      toast.error("كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل")
      return
    }
    setPwBusy(true)
    try {
      const r = await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      })
      if (r.ok) {
        toast.success("تم تغيير كلمة المرور بنجاح")
        setCurrentPw("")
        setNewPw("")
        setShowPw(false)
      } else {
        const body = await r.json().catch(() => null)
        toast.error(body?.detail || "تعذر تغيير كلمة المرور")
      }
    } catch {
      toast.error("خطأ في الاتصال")
    }
    setPwBusy(false)
  }

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader
        icon={<Settings className="size-4" />}
        title="الإعدادات"
        subtitle="إعدادات الحساب"
        compact
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-3xl mx-auto w-full">
        {isLoading ? (
          <LoadingState count={2} />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : user ? (
          <>
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="size-4 text-accent-foreground" /> معلومات الحساب
                </CardTitle>
                <CardDescription>البيانات الأساسية لحسابك في SmartBot</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40">
                  <div className="size-9 rounded-lg bg-accent-foreground/10 text-accent-foreground flex items-center justify-center shrink-0">
                    <User className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-muted-foreground">اسم المستخدم</p>
                    <p className="font-medium truncate">{user.username}</p>
                  </div>
                </div>
                {user.email && (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40">
                    <div className="size-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                      <Mail className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-muted-foreground">البريد الإلكتروني</p>
                      <p className="font-medium truncate" dir="ltr">{user.email}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40">
                  <div className="size-9 rounded-lg bg-green-500/10 text-green-500 flex items-center justify-center shrink-0">
                    <Shield className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-muted-foreground">الصلاحية</p>
                    <p className="font-medium capitalize">{user.role === "admin" ? "مدير" : user.role === "owner" ? "مالك" : "مستخدم"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lock className="size-4 text-accent-foreground" /> الأمان
                </CardTitle>
                <CardDescription>إعدادات المصادقة والحماية</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/50">
                  <div className="size-9 rounded-lg bg-accent-foreground/10 text-accent-foreground flex items-center justify-center shrink-0">
                    <Lock className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">كلمة المرور والتشفير</p>
                    <p className="text-xs text-muted-foreground">كلمات المرور مُعمّاة بـ Argon2id وجلساتك محمية بنطاق واحد</p>
                  </div>
                  <span className="size-2 rounded-full bg-success shrink-0" aria-label="مفعّل" />
                </div>

                {showPw ? (
                  <div className="space-y-3 mt-3">
                    <Input
                      id="current-password"
                      type="password"
                      label="كلمة المرور الحالية"
                      autoComplete="current-password"
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                    />
                    <Input
                      id="new-password"
                      type="password"
                      label="كلمة المرور الجديدة"
                      hint="8 أحرف على الأقل — مختلفة عن الحالية"
                      autoComplete="new-password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button onClick={changePassword} disabled={pwBusy || !currentPw || newPw.length < 8}>
                        {pwBusy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                        {pwBusy ? "جارٍ التغيير…" : "تغيير كلمة المرور"}
                      </Button>
                      <Button variant="ghost" onClick={() => setShowPw(false)} disabled={pwBusy}>
                        إلغاء
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowPw(true)}>
                    <KeyRound className="size-3.5" /> تغيير كلمة المرور
                  </Button>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  )
}

"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { Settings, User, Shield, Mail, Lock, KeyRound } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/PageHeader"
import { LoadingState, ErrorState } from "@/components/ui/EmptyState"
import { unwrapApi } from "@/lib/api"

export default function SettingsPage() {
  const { data: raw, isLoading, isError, refetch } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => apiFetch("/api/me").then(unwrapApi),
  })
  const user = raw?.data || raw

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
                  <User className="size-4 text-orange" /> معلومات الحساب
                </CardTitle>
                <CardDescription>البيانات الأساسية لحسابك في SmartBot</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40">
                  <div className="size-9 rounded-lg bg-orange/10 text-orange flex items-center justify-center shrink-0">
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
                  <Lock className="size-4 text-orange" /> الأمان
                </CardTitle>
                <CardDescription>إعدادات المصادقة والحماية</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/50">
                  <div className="size-9 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
                    <Lock className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">كلمة المرور والتشفير</p>
                    <p className="text-xs text-muted-foreground">كلمات المرور مُعمّاة بـ Argon2id وجلساتك محمية بنطاق واحد</p>
                  </div>
                  <span className="size-2 rounded-full bg-emerald-500 shrink-0" aria-label="مفعّل" />
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  )
}

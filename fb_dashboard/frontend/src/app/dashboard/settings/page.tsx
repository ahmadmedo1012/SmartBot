"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { Settings, User, Shield, Mail , AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function SettingsPage() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["current-user"],
    queryFn: () => apiFetch("/api/me").then(r => r.json()),
  })

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-9 rounded-lg bg-orange/10 flex items-center justify-center">
            <Settings className="size-4 text-orange" />
          </div>
          <div>
            <h1 className="font-bold text-sm">الإعدادات</h1>
            <p className="text-[11px] text-muted-foreground">إعدادات الحساب</p>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoading ? (
          <Card><CardContent className="p-4 animate-pulse h-20" /></Card>
        ) : user ? (
          <>
            <Card>
              <CardContent className="p-4">
                <h3 className="font-bold text-sm mb-3">معلومات الحساب</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3">
                    <User className="size-4 text-muted-foreground" />
                    <span>{user.username}</span>
                  </div>
                  {user.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="size-4 text-muted-foreground" />
                      <span>{user.email}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Shield className="size-4 text-muted-foreground" />
                    <span className="capitalize">{user.role}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">تعذر تحميل الإعدادات</CardContent></Card>
        )}
      </div>
    </div>
  )
}

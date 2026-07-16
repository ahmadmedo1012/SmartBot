"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { Users2, Shield, User, Bot , AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function TeamPage() {
  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: () => apiFetch("/api/team/members").then(r => r.json()),
    refetchInterval: 30000,
  })

  const roleIcon = (role: string) => {
    switch (role) {
      case "admin": return <Shield className="size-3 text-orange" />
      case "editor": return <User className="size-3 text-blue-500" />
      default: return <User className="size-3 text-muted-foreground" />
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-9 rounded-lg bg-orange/10 flex items-center justify-center">
            <Users2 className="size-4 text-orange" />
          </div>
          <div>
            <h1 className="font-bold text-sm">الفريق</h1>
            <p className="text-[11px] text-muted-foreground">إدارة أعضاء الفريق</p>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-12" /></Card>)}</div>
        ) : members.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا يوجد أعضاء فريق بعد</CardContent></Card>
        ) : (
          members.map((m: any) => (
            <Card key={m.id}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="size-10 rounded-full bg-orange/10 flex items-center justify-center font-bold text-sm text-orange">
                  {(m.username?.[0] || "?").toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{m.username}</p>
                  <p className="text-xs text-muted-foreground">{m.email || ""}</p>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {roleIcon(m.role)}
                  <span className="capitalize">{m.role}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

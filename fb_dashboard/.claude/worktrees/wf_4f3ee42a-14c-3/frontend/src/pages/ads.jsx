import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { fetchAdAccounts, fetchCampaigns } from "@/lib/api"
import { RefreshCw, TrendingUp, Target, AlertTriangle, Megaphone } from "lucide-react"

const STATUS_LABELS = {
  1: { label: "نشط", class: "bg-success/15 text-success" },
  2: { label: "محظور", class: "bg-destructive/15 text-destructive" },
  3: { label: "معلق", class: "bg-warning/15 text-warning" },
  4: { label: "غير نشط", class: "bg-muted text-muted-foreground" },
  7: { label: "مؤرشف", class: "bg-muted text-muted-foreground" },
  8: { label: "حذف", class: "bg-destructive/15 text-destructive" },
  9: { label: "قيد المراجعة", class: "bg-info/15 text-info" },
}

const CAMPAIGN_STATUS = {
  ACTIVE: { label: "نشط", class: "bg-success/15 text-success" },
  PAUSED: { label: "متوقف", class: "bg-warning/15 text-warning" },
  DELETED: { label: "محذوف", class: "bg-destructive/15 text-destructive" },
  ARCHIVED: { label: "مؤرشف", class: "bg-muted text-muted-foreground" },
}

export function Ads({ role }) {
  useEffect(() => { document.title = "الإعلانات | SmartBot" }, [])
  const isAdmin = role === "admin"
  const isEditor = role === "admin" || role === "editor"

  const { data: accounts = [], isLoading: acctsLoading, error: acctsError, refetch: refetchAccs } = useQuery({
    queryKey: ["ad-accounts"], queryFn: fetchAdAccounts,
    enabled: isAdmin,
  })

  const [selectedAccount, setSelectedAccount] = useState(null)

  const { data: campaigns = [], isLoading: campLoading } = useQuery({
    queryKey: ["ads-campaigns", selectedAccount],
    queryFn: () => fetchCampaigns(selectedAccount),
    enabled: !!selectedAccount && isEditor,
  })

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <Megaphone className="h-16 w-16 text-muted-foreground/30" />
        <h2 className="text-lg font-semibold text-foreground">غير مصرح</h2>
        <p className="text-sm text-muted-foreground">إدارة الإعلانات متاحة للمدير فقط</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">الإعلانات</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة حملات فيسبوك الإعلانية</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchAccs()}>
          <RefreshCw className="ml-1 h-3 w-3" />تحديث
        </Button>
      </div>

      {acctsLoading ? (
        <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : acctsError ? (
        <div className="flex flex-col items-center py-12 text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-destructive/60" />
          <p className="text-sm text-muted-foreground">فشل تحميل حسابات الإعلانات. تأكد من ربط صفحتك بحساب إعلانات.</p>
          <Button variant="outline" size="sm" onClick={() => refetchAccs()}>إعادة المحاولة</Button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center space-y-4">
          <Megaphone className="h-16 w-16 text-muted-foreground/25" />
          <h2 className="text-lg font-semibold text-foreground">لا توجد حسابات إعلانات</h2>
          <p className="text-sm text-muted-foreground max-w-md">يجب ربط حساب إعلانات فيسبوك أولاً. قم بإنشاء حساب إعلانات من مدير الإعلانات (Ads Manager) على فيسبوك.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map(acc => {
            const status = STATUS_LABELS[acc.account_status] || { label: "غير معروف", class: "bg-muted text-muted-foreground" }
            return (
              <Card key={acc.id}
                className={`cursor-pointer transition-all hover:shadow-md ${selectedAccount === acc.id.replace("act_", "") ? "ring-2 ring-primary" : ""}`}
                onClick={() => setSelectedAccount(acc.id.replace("act_", ""))}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-foreground">{acc.name || "حساب إعلانات"}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-1">{acc.id}</p>
                    </div>
                    <Badge className={status.class}>{status.label}</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">العملة</span>
                      <p className="font-medium text-foreground">{acc.currency || "—"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">الإنفاق</span>
                      <p className="font-medium text-foreground font-mono">{acc.amount_spent || "0"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">الرصيد</span>
                      <p className="font-medium text-foreground font-mono">{acc.balance || "0"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {selectedAccount && (
        <>
          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">الحملات الإعلانية</h2>
            {campLoading ? (
              <div className="grid gap-3 md:grid-cols-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-lg" />)}</div>
            ) : campaigns.length === 0 ? (
              <Card><CardContent className="text-center py-12">
                <Target className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">لا توجد حملات في هذا الحساب</p>
              </CardContent></Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {campaigns.map(c => {
                  const cs = CAMPAIGN_STATUS[c.status] || { label: c.status, class: "bg-muted text-muted-foreground" }
                  return (
                    <Card key={c.id}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Target className="h-5 w-5 text-primary" />
                            <h3 className="font-semibold text-foreground text-sm">{c.name}</h3>
                          </div>
                          <Badge className={cs.class}>{cs.label}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>الهدف: {c.objective || "—"}</p>
                          <p>المجموعات: {c.adsets?.data?.length || 0}</p>
                          <p className="font-mono">{c.created_time?.slice(0, 10) || ""}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

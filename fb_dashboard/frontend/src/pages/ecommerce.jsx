import { useQuery, useMutation } from "@tanstack/react-query"
import { fetchCommerceStatus, configureShopify } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { ShoppingCart, RefreshCw, Link2, Unlink, AlertCircle } from "lucide-react"
import { useState } from "react"

function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
      <div className="p-3 rounded-full bg-destructive/10">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <p className="text-sm text-muted-foreground">{error?.message || "فشل التحميل"}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="ml-1 h-3 w-3" />
        إعادة المحاولة
      </Button>
    </div>
  )
}

export function Ecommerce() {
  const [domain, setDomain] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [accessToken, setAccessToken] = useState("")

  const { data: status, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["commerce-status"],
    queryFn: fetchCommerceStatus,
  })

  const testMut = useMutation({
    mutationFn: fetchCommerceStatus,
    onSuccess: (data) => {
      if (data.configured) {
        toast.success("✅ الاتصال بالمكتبة ناجح")
      } else {
        toast.error("❌ المكتبة غير مهيأة")
      }
    },
    onError: (err) => toast.error(`❌ فشل الاتصال: ${err.message}`),
  })

  const saveMut = useMutation({
    mutationFn: () => configureShopify(domain, accessToken),
    onSuccess: () => {
      toast.success("✅ تم حفظ إعدادات المكتبة")
      setDomain(""); setApiKey(""); setApiSecret(""); setAccessToken("")
      refetch()
    },
    onError: (err) => toast.error(`❌ فشل الحفظ: ${err.message}`),
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <ShoppingCart className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">المتجر الإلكتروني</h1>
        </div>
        <Card>
          <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isError) return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <ShoppingCart className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">المتجر الإلكتروني</h1>
      </div>
      <ErrorState error={error} onRetry={refetch} />
    </div>
  )

  const connected = status?.configured

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <ShoppingCart className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">المتجر الإلكتروني</h1>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">حالة الاتصال</CardTitle>
          <Badge variant={connected ? "default" : "secondary"} className={connected ? "bg-green-600" : ""}>
            {connected ? (
              <><Link2 className="ml-1 h-3 w-3" /> متصل</>
            ) : (
              <><Unlink className="ml-1 h-3 w-3" /> غير مهيأ</>
            )}
          </Badge>
        </CardHeader>
        <CardContent>
          {connected && status?.store_domain && (
            <p className="text-sm text-muted-foreground">
              النطاق: <span dir="ltr" className="font-mono">{status.store_domain}</span>
            </p>
          )}
          <Button variant="outline" size="sm" className="mt-3" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
            <RefreshCw className={`ml-1 h-3 w-3 ${testMut.isPending ? "animate-spin" : ""}`} />
            اختبار الاتصال
          </Button>
        </CardContent>
      </Card>

      {/* Shopify Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">إعدادات Shopify</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); saveMut.mutate() }} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">نطاق المتجر</label>
              <Input
                placeholder="my-store.myshopify.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">مفتاح API</label>
              <Input
                placeholder="API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">مفتاح API السري</label>
              <Input
                placeholder="API Secret Key"
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">رمز الوصول (Access Token)</label>
              <Input
                placeholder="shpat_..."
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                dir="ltr"
              />
            </div>
            <Button type="submit" disabled={saveMut.isPending || !domain || !accessToken}>
              {saveMut.isPending ? "جاري الحفظ..." : "حفظ الإعدادات"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

import { motion } from "framer-motion"
import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAdaptiveInterval } from "@/hooks/use-refresh-engine"
import { fetchOffers, createOffer, toggleOffer, deleteOffer } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Gift, Plus, Power, Trash2, Tag, Percent, Calendar, AlertCircle } from "lucide-react"
import { format } from "date-fns"

export function Offers({ role }) {
  useEffect(() => { document.title = "العروض | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState("")
  const [code, setCode] = useState("")
  const [description, setDescription] = useState("")
  const [discountValue, setDiscountValue] = useState(10)
  const [expiresAt, setExpiresAt] = useState("")

  const offerInterval = useAdaptiveInterval("critical")
  const { data: offers = [], isLoading, error, refetch } = useQuery({
    queryKey: ["offers"], queryFn: () => fetchOffers(),
    staleTime: 5000, refetchOnWindowFocus: true,
    refetchInterval: offerInterval, retry: 2,
    placeholderData: (prev) => prev,
  })

  const activeOffers = offers.filter(o => o.is_active)
  const expiredOffers = offers.filter(o => !o.is_active)

  const createMut = useMutation({
    mutationFn: () => createOffer(title, code, description, "percentage", discountValue, expiresAt),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["offers"] }); setShowAdd(false); resetForm(); toast.success("تم إنشاء العرض") },
    onError: (e) => toast.error(e.message),
  })
  const toggleMut = useMutation({
    mutationFn: (id) => toggleOffer(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["offers"] }); toast.success("تم تحديث الحالة") },
    onError: (e) => toast.error(e.message),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => deleteOffer(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["offers"] }); toast.success("تم حذف العرض") },
    onError: (e) => toast.error(e.message),
  })

  function resetForm() { setTitle(""); setCode(""); setDescription(""); setDiscountValue(10); setExpiresAt("") }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="content-container space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold flex items-center gap-2">
            <Gift className="size-6 text-success" />
            العروض والكوبونات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            أنشئ عروض خصم للعملاء — تظهر تلقائياً في الردود على استفسارات الأسعار
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => { resetForm(); setShowAdd(true) }}>
            <Plus className="ml-2 h-4 w-4" />عرض جديد
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-success">{activeOffers.length}</p>
          <p className="text-xs text-muted-foreground">عروض نشطة</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold">{offers.length}</p>
          <p className="text-xs text-muted-foreground">إجمالي</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold font-mono tabular-nums">{offers.reduce((s, o) => s + (o.used_count || 0), 0)}</p>
          <p className="text-xs text-muted-foreground">استخدامات</p>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      ) : error ? (
        <div className="flex flex-col items-center py-16"><AlertCircle className="h-12 w-12 text-destructive mb-4" /><Button variant="outline" onClick={refetch}>إعادة</Button></div>
      ) : offers.length === 0 ? (
        <div className="flex flex-col items-center py-16">
          <Gift className="h-16 w-16 text-muted-foreground/20 mb-4" />
          <p className="text-lg font-medium">لا توجد عروض بعد</p>
          <p className="text-sm text-muted-foreground mt-1">أضف عرضاً وسيظهر تلقائياً مع الردود على استفسارات الأسعار</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Active Offers */}
          {activeOffers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">العروض النشطة</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activeOffers.map(o => (
                  <Card key={o.id} className="border-success/30 border-r-2 border-r-success panel-top-accent-success">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-sm font-semibold">{o.title}</CardTitle>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="size-7 text-success" onClick={() => toggleMut.mutate(o.id)}><Power className="size-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => { if (confirm("حذف؟")) deleteMut.mutate(o.id) }}><Trash2 className="size-3.5" /></Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {o.code && (
                        <div className="flex items-center gap-2">
                          <Tag className="size-3.5 text-muted-foreground" />
                          <code className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{o.code}</code>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Percent className="size-3.5" />
                        <span>{o.discount_value}% خصم</span>
                      </div>
                      {o.description && <p className="text-xs text-muted-foreground">{o.description}</p>}
                      <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
                        {o.expires_at && <span className="flex items-center gap-1"><Calendar className="size-3" />{format(new Date(o.expires_at), "yyyy/MM/dd")}</span>}
                        <span>استخدم {o.used_count || 0} مرة</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          {/* Expired/Inactive */}
          {expiredOffers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-4">غير نشطة</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {expiredOffers.map(o => (
                  <Card key={o.id} className="opacity-60">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{o.title}</p>
                        {o.code && <code className="text-xs font-mono text-muted-foreground">{o.code}</code>}
                      </div>
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => toggleMut.mutate(o.id)}><Power className="size-3.5 text-muted-foreground" /></Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="glass-heavy">
          <DialogHeader><DialogTitle>عرض جديد</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">اسم العرض</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="مثال: عرض الصيف" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">كود الخصم (اختياري)</label>
              <Input value={code} onChange={e => setCode(e.target.value)} placeholder="SUMMER30" />
              <p className="text-xs text-muted-foreground">يظهر تلقائياً في الردود على استفسارات الأسعار</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">نسبة الخصم %</label>
              <Input type="number" value={discountValue} onChange={e => setDiscountValue(parseInt(e.target.value) || 0)} min={1} max={100} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">تاريخ الانتهاء (اختياري)</label>
              <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">وصف</label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="خصم 30% على كل المنتجات" />
            </div>
            <Button onClick={() => createMut.mutate()} disabled={!title.trim() || createMut.isPending} className="w-full gap-2">
              <Gift className="size-4" />{createMut.isPending ? "جاري..." : "إنشاء العرض"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mobile-nav-spacer" />
    </motion.div>
  )
}

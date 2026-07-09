import { motion } from "framer-motion"
import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAdaptiveInterval } from "@/hooks/use-refresh-engine"
import {
  fetchPublisherStatus, configurePublisher, publishToPlatform, fetchPlatformSettings,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  Globe, Settings2, CheckCircle2, XCircle, Plus, AlertCircle,
} from "lucide-react"

const PLATFORMS = {
  facebook: { label: "فيسبوك", icon: Globe, color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  instagram: { label: "إنستغرام", icon: Globe, color: "bg-pink-500/10 text-pink-500 border-pink-500/20" },
  x: { label: "X (تويتر)", icon: Globe, color: "bg-neutral-900/10 text-neutral-900 border-neutral-900/20 dark:bg-white/10 dark:text-white" },
  linkedin: { label: "لينكد إن", icon: Globe, color: "bg-blue-700/10 text-blue-700 border-blue-700/20" },
}

function PlatformCard({ platform, status, onConfigure, role }) {
  const info = PLATFORMS[platform] || { label: platform, icon: Globe, color: "" }
  const configured = status?.configured
  const canEdit = role === "admin"

  return (
    <Card className={`border-l-4 ${configured ? "border-l-success" : "border-l-muted"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${configured ? "bg-success/10" : "bg-muted"}`}>
              <info.icon className={`size-5 ${configured ? "text-success" : "text-muted-foreground"}`} />
            </div>
            <div>
              <CardTitle className="text-sm">{info.label}</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {status?.platform || platform}
              </CardDescription>
            </div>
          </div>
          {configured ? (
            <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-xs">
              <CheckCircle2 className="size-3 ml-1" /> متصل
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">
              <XCircle className="size-3 ml-1" /> غير متصل
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          {canEdit && platform !== "facebook" && platform !== "instagram" && (
            <Button variant="outline" size="sm" className="text-xs" onClick={() => onConfigure(platform)}>
              <Settings2 className="size-3 ml-1" />
              {configured ? "تعديل الإعدادات" : "توصيل"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ConfigureDialog({ platform, open, onOpenChange }) {
  const queryClient = useQueryClient()
  const { data: template } = useQuery({
    queryKey: ["platform-settings", platform],
    queryFn: () => fetchPlatformSettings(platform),
    enabled: open && !!platform,
  })
  const [values, setValues] = useState({})

  useEffect(() => {
    if (open) setValues({})
  }, [open])

  const configureMut = useMutation({
    mutationFn: () => configurePublisher(platform, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publisher-status"] })
      onOpenChange(false)
      toast.success(`تم حفظ إعدادات ${PLATFORMS[platform]?.label || platform}`)
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>إعدادات {PLATFORMS[platform]?.label || platform}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {template?.fields?.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{field.label}</label>
              <Input
                type={field.type === "password" ? "password" : "text"}
                value={values[field.key] || ""}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                placeholder={field.hint || ""}
              />
              {field.hint && (
                <p className="text-xs text-muted-foreground">{field.hint}</p>
              )}
            </div>
          ))}
          <Button onClick={() => configureMut.mutate()} disabled={configureMut.isPending} className="w-full">
            {configureMut.isPending ? "جاري الحفظ..." : "حفظ الإعدادات"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function Publisher({ role }) {
  useEffect(() => { document.title = "النشر المتعدد | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()

  const [configPlatform, setConfigPlatform] = useState("")
  const [showConfig, setShowConfig] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [composePlatform, setComposePlatform] = useState("facebook")
  const [message, setMessage] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [scheduledAt, setScheduledAt] = useState("")

  const pubInterval = useAdaptiveInterval("normal")
  const { data: status, isLoading, error, refetch } = useQuery({
    queryKey: ["publisher-status"],
    queryFn: fetchPublisherStatus,
    staleTime: 15000, refetchOnWindowFocus: true,
    refetchInterval: pubInterval, retry: 2,
    placeholderData: (prev) => prev,
  })

  const publishMut = useMutation({
    mutationFn: () => publishToPlatform({
      platform: composePlatform,
      message,
      image_url: imageUrl,
      scheduled_at: scheduledAt,
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["publisher-status"] })
      setShowCompose(false)
      setMessage("")
      setImageUrl("")
      setScheduledAt("")
      toast.success(res.status === "scheduled" ? "تمت الجدولة" : "تم النشر")
    },
    onError: (e) => toast.error(e.message),
  })

  function handleConfigure(platform) {
    setConfigPlatform(platform)
    setShowConfig(true)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">النشر المتعدد</h1>
          <p className="text-sm text-muted-foreground mt-1">انشر على فيسبوك، X، لينكد إن في آن واحد</p>
        </div>
        {canEdit && (
          <Button onClick={() => setShowCompose(true)}>
            <Plus className="ml-2 h-4 w-4" /> منشور جديد
          </Button>
        )}
      </div>

      {/* Connection status cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-16">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <p className="text-sm text-muted-foreground mb-4">فشل تحميل حالة الاتصال</p>
          <Button variant="outline" onClick={refetch}>إعادة المحاولة</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(PLATFORMS).map(([key]) => (
            <PlatformCard
              key={key}
              platform={key}
              status={status?.[key]}
              onConfigure={handleConfigure}
              role={role}
            />
          ))}
        </div>
      )}

      {/* Compose dialog */}
      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>منشور جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">المنصة</label>
              <Select value={composePlatform} onValueChange={setComposePlatform}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLATFORMS).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <val.icon className="size-4" />
                        {val.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">النص</label>
              <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="اكتب المنشور..." />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">رابط الصورة (اختياري)</label>
              <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">جدولة النشر (اختياري)</label>
              <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
            </div>
            <Button
              onClick={() => publishMut.mutate()}
              disabled={!message.trim() || publishMut.isPending}
              className="w-full"
            >
              {publishMut.isPending ? "جاري..." : scheduledAt ? "جدولة" : "نشر الآن"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Configure dialog */}
      <ConfigureDialog
        platform={configPlatform}
        open={showConfig}
        onOpenChange={setShowConfig}
      />

      {/* Empty state when no status loaded */}
      {!isLoading && !error && !status && (
        <div className="flex flex-col items-center py-16">
          <Globe className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-sm text-muted-foreground">لا توجد منصات متصلة حالياً</p>
        </div>
      )}
      <div className="mobile-nav-spacer" />
    </motion.div>
  )
}

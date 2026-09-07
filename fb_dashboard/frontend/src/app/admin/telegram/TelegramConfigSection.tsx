"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bot, Save, Send, Stethoscope, Eye, EyeOff, Loader2 } from "lucide-react"

interface Config {
  botToken: string
  botTokenMasked?: boolean
  chatId: string
  events: string[]
  isActive: boolean
}

export function TelegramConfigSection({
  config, eventsInput, showToken, saving, testing, diagnosing,
  onConfigChange, onEventsChange, onToggleShowToken,
  onSave, onTest, onDiagnose,
}: {
  config: Config
  eventsInput: string
  showToken: boolean
  saving: boolean
  testing: boolean
  diagnosing: boolean
  onConfigChange: (c: Config) => void
  onEventsChange: (v: string) => void
  onToggleShowToken: () => void
  onSave: () => void
  onTest: () => void
  onDiagnose: () => void
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Bot className="size-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold">إعدادات البوت</h3>
        {/* v14-E4 (D3 M8): mr-auto → ms-auto — logical property for the
            RTL-first codebase (physical margin worked only by coincidence). */}
        <Badge variant={config.isActive ? "default" : "secondary"} className="ms-auto">
          {config.isActive ? "نشط" : "غير نشط"}
        </Badge>
      </div>
      <div className="rounded-md bg-card/50 border border-border/30 overflow-hidden">
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="tg-active" className="flex items-center gap-2 cursor-pointer">
              <Bot className="size-4 text-muted-foreground" aria-hidden="true" />
              تفعيل إشعارات تليجرام
            </Label>
            <Switch id="tg-active" checked={config.isActive} onCheckedChange={(v) => onConfigChange({ ...config, isActive: v })} />
          </div>
          <div>
            <Label htmlFor="tg-bot-token">رمز البوت (Bot Token)</Label>
            <div className="relative mt-1.5">
              <Input id="tg-bot-token" type={showToken ? "text" : "password"} value={config.botToken}
                onChange={(e) => onConfigChange({ ...config, botToken: e.target.value })}
                placeholder="123456789:ABCdefGHIjklmNOPqrstUVwxyz" className="h-11 rounded-xl text-left pl-10" dir="ltr" />
              <button type="button" onClick={onToggleShowToken}
                /* v14-E4 (D4 H-06, WCAG 2.5.8 AA 24×24): was a bare absolute
                   icon wrapper ≈16×16px — below the minimum target size.
                   size-7 (28px) + rounded-md, the exact reveal-toggle recipe
                   from login:202-203 / register:202-204. */
                className="absolute end-3 top-1/2 -translate-y-1/2 size-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-90"
                aria-label={showToken ? "إخفاء الرمز" : "إظهار الرمز"}>
                {showToken ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              احصل على الرمز من{" "}
              <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" aria-label="@BotFather — يفتح في تبويب جديد" className="underline">@BotFather</a>
            </p>
          </div>
          <div>
            <Label htmlFor="tg-chat-id">معرف المحادثة (Chat ID)</Label>
            <Input id="tg-chat-id" value={config.chatId}
              onChange={(e) => onConfigChange({ ...config, chatId: e.target.value })}
              placeholder="-1001234567890" className="h-11 rounded-xl mt-1.5 text-left" dir="ltr" />
            <p className="text-xs text-muted-foreground mt-1">
              أرسل <span className="font-mono" dir="ltr">/start</span> إلى{" "}
              <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" aria-label="@userinfobot — يفتح في تبويب جديد" className="underline">@userinfobot</a> لمعرفة المعرف
            </p>
          </div>
          <div>
            <Label htmlFor="tg-events">الأحداث المرسلة (مفصولة بفاصلة)</Label>
            <Input id="tg-events" value={eventsInput} onChange={(e) => onEventsChange(e.target.value)}
              placeholder="payment_received, subscription_approved, system_alert" className="h-11 rounded-xl mt-1.5 text-left" dir="ltr" />
            <p className="text-xs text-muted-foreground mt-1">أمثلة: user_signup, restaurant_created, system_alert</p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={onSave} disabled={saving} className="rounded-xl gap-1">
              <Save className="size-4" aria-hidden="true" />
              {saving ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
            </Button>
            <Button variant="outline" onClick={onTest}
              disabled={testing || !config.botToken.trim() || !config.chatId.trim()} className="rounded-xl gap-1">
              {testing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />}
              {testing ? "جارٍ…" : "اختبار الإرسال"}
            </Button>
            <Button variant="outline" onClick={onDiagnose} disabled={diagnosing} className="rounded-xl gap-1">
              {diagnosing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Stethoscope className="size-4" aria-hidden="true" />}
              {diagnosing ? "جارٍ…" : "تشخيص"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

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
              {/* v15-E5 (D4-H2): the field starts EMPTY when a token is
                  already saved (botTokenMasked) — the «••••••••» mask was
                  previously seeded INTO the value and sent back on every
                  save (400). Leave it empty to keep the stored token; type
                  a new one to replace it. */}
              <Input id="tg-bot-token" type={showToken ? "text" : "password"} value={config.botToken}
                onChange={(e) => onConfigChange({ ...config, botToken: e.target.value })}
                placeholder={config.botTokenMasked ? "الرمز محفوظ — أدخل رمزاً جديداً لاستبداله" : "123456789:ABCdefGHIjklmNOPqrstUVwxyz"} className="h-11 rounded-xl text-left pl-14" dir="ltr" />
              {/* v24-C1: size-11 (44px) touch target (A1 S3) — pl-14 on the
                  input clears the wider button inside this LTR island. */}
              <button type="button" onClick={onToggleShowToken}
                /* v14-E4 (D4 H-06, WCAG 2.5.8 AA 24×24): was a bare absolute
                   icon wrapper ≈16×16px — below the minimum target size.
                   rounded-md, the exact reveal-toggle recipe from the login
                   and register password fields. */
                className="absolute end-3 top-1/2 -translate-y-1/2 size-11 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-90"
                aria-label={showToken ? "إخفاء الرمز" : "إظهار الرمز"}>
                {/* v17-E-B2 (D2 §3.3#7): Eye↔EyeOff crossfade instead of the
                    instant swap — the tt-icon recipe (globals.css:507-512)
                    re-expressed in pure Tailwind so no shared CSS class is
                    needed yet (S3 may adopt it into the planned .icon-swap).
                    Both icons stack in one grid cell; the hidden one fades +
                    rotates -90° + scales to 0.5. prefers-reduced-motion is
                    covered by the global net (globals.css:549-551 zeroes
                    every transition-duration). */}
                <span className="grid" aria-hidden="true">
                  <Eye className={`col-start-1 row-start-1 size-4 transition-[opacity,transform] duration-200 ease-out ${showToken ? "opacity-0 -rotate-90 scale-50" : ""}`} />
                  <EyeOff className={`col-start-1 row-start-1 size-4 transition-[opacity,transform] duration-200 ease-out ${showToken ? "" : "opacity-0 -rotate-90 scale-50"}`} />
                </span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {config.botTokenMasked
                ? "الرمز الحالي محفوظ ولا يُرسل مع الحفظ ما لم تدخل رمزاً جديداً — يمكنك تغيير باقي الحقول مباشرة."
                : <>احصل على الرمز من{" "}<a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" aria-label="@BotFather — يفتح في تبويب جديد" className="underline">@BotFather</a></>}
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
              /* v15-E5 (D4-H2): the saved-token case (botTokenMasked) also
                 enables the test — /api/telegram/test reads the STORED
                 token server-side; an empty field no longer disables it. */
              disabled={testing || !(config.botToken.trim() || config.botTokenMasked) || !config.chatId.trim()} className="rounded-xl gap-1">
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

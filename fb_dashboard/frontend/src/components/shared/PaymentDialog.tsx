"use client"

import { useState, useEffect, useCallback, useRef, useId } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { apiFetch } from "@/lib/csrf-client"
import { premiumToast } from "@/lib/premium-toast"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { Smartphone, Landmark, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import AnimatedUpload from "@/components/ui/upload-icon"
import AnimatedCopy from "@/components/ui/copy-icon"
import { useConfig } from "@/hooks/useConfig"
import { OptimizedImage } from "@/components/ui/OptimizedImage"
import { compressImage } from "@/lib/image-compress"

/* Ported from Smart-Menu (smart-link.ly shared identity) — the brand's
   canonical payment experience: modal with orange gradient header, plan
   summary chip, 3-provider tab rail (auto bank-switch above the wallet
   cap), USSD quick-transfer card with copy+dial one-tap, bank rows with
   per-row copy, receipt upload with client-side compression, and the
   animated waiting/approved/rejected resolution screens.

   Adaptations (SmartBot data model):
   - providers are 'liyana' | 'madar' | 'bank' (SmartBot backend contract)
   - POST /api/subscriptions {plan_id, provider, amount, phone,
     senderAccountName, senderAccountNumber, receiptImageUrl}
   - status poll: /api/subscriptions/status?payment_id= + SSE
     status-stream as the primary push channel (Track B.5), poll fallback
   - no temp restaurants/username props — SmartBot subscribers are
     authenticated tenants */

type Provider = "liyana" | "madar" | "bank"

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  planId: number
  planNameAr: string
  price: number
  onSuccess: () => void
}

export function PaymentDialog({
  open,
  onOpenChange,
  planId,
  planNameAr,
  price,
  onSuccess,
}: PaymentDialogProps) {
  const [provider, setProvider] = useState<Provider>("liyana")
  // Mobile wallets (liyana/madar) cap at 99 LYD — plans above that require bank transfer
  const requiresBank = Number(price) > 99
  // Auto-switch to bank when the plan exceeds the wallet cap
  useEffect(() => {
    if (requiresBank && (provider === "liyana" || provider === "madar")) {
      setProvider("bank")
    }
  }, [requiresBank, provider])
  const { config } = useConfig()
  const MADAR_PHONE = (config?.balance_transfer_phone_1 as string) || "0910089975"
  const LIBYANA_PHONE = (config?.balance_transfer_phone_2 as string) || "0942119637"

  const [phone, setPhone] = useState("")
  // Bank form fields with associated labels (a11y) — Smart-Menu Stage C fix
  const bankAmountId = useId()
  const senderNameId = useId()
  const senderNumberId = useId()
  const [bankAmount, setBankAmount] = useState(price)
  const [senderAccountName, setSenderAccountName] = useState("")
  const [senderAccountNumber, setSenderAccountNumber] = useState("")
  const [receiptImageUrl, setReceiptImageUrl] = useState("")
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const [step, setStep] = useState<"form" | "waiting" | "success" | "approved" | "rejected">("form")
  const [resolutionMsg, setResolutionMsg] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [paymentId, setPaymentId] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sseRef = useRef<EventSource | null>(null)

  const providerPhone = provider === "liyana" ? LIBYANA_PHONE : MADAR_PHONE
  const providerName = provider === "liyana" ? "ليبيانا" : "مدار"

  // Bank account details from SystemConfig (same mechanism as the phones)
  const BANK_NAME = (config?.bank_transfer_bank_name as string) || ""
  const BANK_ACCOUNT = (config?.bank_transfer_account_number as string) || ""
  const BANK_IBAN = (config?.bank_transfer_iban as string) || ""

  const quickTransferCode =
    provider === "liyana"
      ? `*122*218${LIBYANA_PHONE.slice(1)}*${price * 1000}*1#`
      : `*140*4*1*${price}*${MADAR_PHONE}#`

  const encodedUSSD = quickTransferCode.replace(/#/g, "%23")

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text)
      premiumToast("copy", "تم النسخ")
      return true
    } catch {
      premiumToast("error", "فشل النسخ")
      return false
    }
  }

  const visibilityHandlerRef = useRef<(() => void) | null>(null)

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (sseRef.current) {
      sseRef.current.close()
      sseRef.current = null
    }
    // Always detach the visibility listener — safe to call multiple times
    if (visibilityHandlerRef.current) {
      document.removeEventListener("visibilitychange", visibilityHandlerRef.current)
      visibilityHandlerRef.current = null
    }
  }, [])

  const sentRef = useRef(false)
  const handleSent = async () => {
    if (sentRef.current) return // block double-click double-payment
    const isBank = provider === "bank"
    // Validate BEFORE latching the guard — a failed validation must leave
    // the button usable.
    if (!isBank && !phone.trim()) {
      premiumToast("error", "يرجى إدخال رقم هاتفك")
      return
    }
    if (isBank) {
      if (!senderAccountName.trim()) {
        premiumToast("error", "يرجى إدخال اسم صاحب الحساب")
        return
      }
      if (!senderAccountNumber.trim()) {
        premiumToast("error", "يرجى إدخال رقم الحساب")
        return
      }
    }
    sentRef.current = true
    setSubmitting(true)
    try {
      const res = await apiFetch("/api/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          plan_id: planId,
          provider,
          amount: isBank ? bankAmount : price,
          phone: isBank ? undefined : phone.trim(),
          ...(isBank
            ? {
                senderAccountName: senderAccountName.trim(),
                senderAccountNumber: senderAccountNumber.trim(),
                ...(receiptImageUrl ? { receiptImageUrl } : {}),
              }
            : {}),
        }),
      })
      const json = await res.json()
      const pid = json?.data?.payment_id
      if (!pid) throw new Error(json?.error ?? "فشل إرسال طلب الدفع")
      setPaymentId(pid)
      setStep("waiting")
    } catch (e: unknown) {
      // apiFetch throws ApiError carrying the parsed body — surface the
      // server's Arabic message, never a raw status code.
      const msg =
        (e && typeof e === "object" && "body" in e && e.body &&
          typeof e.body === "object" && "error" in (e.body as Record<string, unknown>) &&
          String((e.body as Record<string, unknown>).error)) ||
        (e instanceof Error && e.message) ||
        "فشل إرسال طلب الدفع"
      premiumToast("error", msg)
      sentRef.current = false // allow retry on failure
    } finally {
      setSubmitting(false)
    }
  }

  // Poll for admin approval — every provider waits for a human decision
  // (no auto-verify). Success only via poll status=verified.
  // SmartBot Track B.5: SSE is PRIMARY (pushes the decision ≤2s); the
  // 5s interval poll below is the fallback when SSE is unsupported.
  useEffect(() => {
    if (step !== "waiting") return

    if (paymentId && (provider === "liyana" || provider === "madar" || provider === "bank")) {
      let pollFailures = 0
      const warnedRef = { current: false }
      let settled = false

      const onVerified = () => {
        if (settled) return
        settled = true
        cleanup()
        setResolutionMsg("تم الموافقة على اشتراكك بنجاح! سيتم توجيهك إلى لوحة التحكم.")
        setStep("approved")
      }
      const onRejected = (message?: string) => {
        if (settled) return
        settled = true
        cleanup()
        setResolutionMsg(message || "عذراً، تم رفض طلب تفعيل الاشتراك. يمكنك تعديل البيانات والمحاولة مرة أخرى.")
        setStep("rejected")
      }

      const startStatusPoll = () => {
        pollRef.current = setInterval(async () => {
          try {
            const res = await fetch(`/api/subscriptions/status?payment_id=${paymentId}`)
            const json = await res.json()
            pollFailures = 0
            if (json.data?.status === "verified") onVerified()
            if (json.data?.status === "cancelled" || json.data?.status === "rejected") onRejected(json.data?.message)
          } catch {
            pollFailures++
            if (pollFailures >= 3 && !warnedRef.current) {
              warnedRef.current = true
              premiumToast("error", "تعذر الاتصال بالخادم — تحقق من اتصالك بالإنترنت")
            }
          }
        }, 5000)
      }
      const stopStatusPoll = () => {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }

      // SSE push channel — instant activation the moment the admin decides
      try {
        const es = new EventSource(`/api/subscriptions/status-stream?payment_id=${paymentId}`)
        sseRef.current = es
        es.onmessage = (ev) => {
          try {
            const payload = JSON.parse(ev.data)
            if (payload.status === "verified") onVerified()
            else if (payload.status === "cancelled" || payload.status === "rejected") onRejected(payload.message)
          } catch {
            /* malformed frame — polling still covers us */
          }
        }
        es.addEventListener("close", () => {
          es.close()
          if (sseRef.current === es) sseRef.current = null
        })
        es.onerror = () => {
          // SSE failed (proxy/unsupported) — close it; interval polling takes over
          es.close()
          if (sseRef.current === es) sseRef.current = null
        }
      } catch {
        /* EventSource unavailable — polling takes over */
      }

      // Perf: don't poll the status endpoint while the tab is hidden
      const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") stopStatusPoll()
        else startStatusPoll()
      }

      startStatusPoll()
      document.addEventListener("visibilitychange", onVisibilityChange)
      visibilityHandlerRef.current = onVisibilityChange
    }

    return () => {
      cleanup()
    }
  }, [step, paymentId, provider, cleanup])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        cleanup()
        sentRef.current = false // fresh submit allowed on reopen
        setStep("form")
        setPhone("")
        setBankAmount(price)
        setSenderAccountName("")
        setSenderAccountNumber("")
        setReceiptImageUrl("")
        setPaymentId(null)
      }
      onOpenChange(open)
    },
    [onOpenChange, price, cleanup],
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-md rounded-2xl p-0 gap-0 max-h-[90dvh] overflow-y-auto border-border/50 shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-br from-orange to-orange/80 text-white p-6">
          <div className="flex items-center gap-2 mb-2">
            <Smartphone className="size-5" />
            <DialogTitle className="text-white text-lg font-bold">دفع الاشتراك</DialogTitle>
          </div>
          <DialogDescription className="text-white/70 text-sm">
            ادفع عبر المحفظة الإلكترونية
          </DialogDescription>
        </div>

        <div className="p-5 space-y-5">
          {/* Plan summary */}
          <div className="rounded-xl bg-orange-muted/50 dark:bg-orange-muted/20 border border-orange/15 p-4">
            <div className="flex justify-between items-center">
              <span className="font-bold">{planNameAr}</span>
              <span className="text-lg font-bold text-orange">{price} د.ل</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">اشتراك شهري</p>
          </div>

          {step === "form" && (
            <>
              {/* Payment method tabs */}
              <div>
                <Label>طريقة الدفع</Label>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  {[
                    { id: "liyana" as Provider, label: "ليبيانا", icon: Smartphone, disabled: requiresBank },
                    { id: "madar" as Provider, label: "مدار", icon: Smartphone, disabled: requiresBank },
                    { id: "bank" as Provider, label: "تحويل بنكي", icon: Landmark, disabled: false },
                  ].map((opt) => {
                    const Icon = opt.icon
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setProvider(opt.id)}
                        disabled={opt.disabled}
                        className={cn(
                          "h-14 rounded-xl border-2 text-[13px] font-medium transition-[border-color,box-shadow,color,background-color] flex flex-col items-center justify-center gap-1",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/50",
                          opt.disabled && "opacity-40 cursor-not-allowed",
                          provider === opt.id
                            ? "border-orange bg-orange-muted/40 dark:bg-orange-muted/20 shadow-sm"
                            : "border-border/30 hover:border-orange/30 text-muted-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                {requiresBank && (
                  <p className="text-xs text-orange mt-2">
                    المبالغ فوق 99 د.ل تتطلب تحويل بنكي — اختر &quot;تحويل بنكي&quot; لإتمام الدفع
                  </p>
                )}
              </div>

              {provider !== "bank" && (
                <>
                  {/* Provider phone */}
                  <div className="rounded-xl bg-muted/30 border border-border/20 p-3">
                    <p className="text-xs text-muted-foreground mb-1">أرسل المبلغ إلى {providerName}</p>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-lg tracking-wide font-mono" dir="ltr">
                        {providerPhone}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(providerPhone)}
                        className="size-10 rounded-lg border border-border/30 flex items-center justify-center hover:bg-accent transition-colors"
                        title="نسخ الرقم"
                      >
                        <AnimatedCopy className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Quick transfer code */}
                  <div className="rounded-xl bg-success/10 border border-success/25 p-3">
                    <p className="text-xs font-medium text-success mb-1.5">رمز التحويل السريع</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-orange truncate" dir="ltr">
                        {quickTransferCode}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* One-tap: copy the code, then open the dialer (only on copy success) */}
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await copyToClipboard(quickTransferCode)
                            if (!ok) return
                            setTimeout(() => {
                              window.location.href = `tel:${encodedUSSD}`
                            }, 150)
                          }}
                          className="h-9 px-3 rounded-lg bg-success hover:bg-success/90 text-success-foreground text-xs font-medium flex items-center gap-1.5 transition-colors"
                          title="نسخ الرمز وفتح الاتصال"
                        >
                          <AnimatedCopy className="size-3.5" />
                          نسخ واتصال
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* User phone */}
                  <div>
                    <Label htmlFor="payment-phone">رقم هاتفك</Label>
                    <Input
                      id="payment-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="09XXXXXXXXX"
                      inputMode="numeric"
                      maxLength={10}
                      className="h-11 rounded-xl mt-1.5 text-left font-mono"
                      dir="ltr"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      10 أرقام تبدأ بـ 09 — حتى نتمكن من التأكد من استلام التحويل
                    </p>
                  </div>
                </>
              )}

              {/* Bank transfer section — replaces the mobile template entirely */}
              {provider === "bank" && (
                <>
                  {/* Bank account info card */}
                  <div className="rounded-xl bg-muted/30 border border-border/20 p-3 space-y-2.5">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <Landmark className="size-3.5 text-orange" />
                      حوّل على الحساب البنكي التالي
                    </p>
                    {[
                      { label: "المصرف", value: BANK_NAME },
                      { label: "رقم الحساب", value: BANK_ACCOUNT },
                      { label: "IBAN", value: BANK_IBAN },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground shrink-0">{row.label}</span>
                        <span className="font-mono text-sm font-bold text-left truncate" dir="ltr">
                          {row.value}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(row.value)}
                          className="size-10 rounded-lg border border-border/30 flex items-center justify-center hover:bg-accent transition-colors shrink-0"
                          title={`نسخ ${row.label}`}
                        >
                          <AnimatedCopy className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Bank amount — no 99 cap (server enforces plan price) */}
                  <div>
                    <Label htmlFor={bankAmountId}>المبلغ (د.ل)</Label>
                    <Input
                      id={bankAmountId}
                      type="number"
                      value={bankAmount}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        if (isNaN(v) || v < 0) return
                        setBankAmount(v)
                      }}
                      className="h-11 rounded-xl mt-1.5"
                      min={1}
                    />
                  </div>

                  {/* Sender account name */}
                  <div>
                    <Label htmlFor={senderNameId}>اسم صاحب الحساب المُرسِل *</Label>
                    <Input
                      id={senderNameId}
                      value={senderAccountName}
                      onChange={(e) => setSenderAccountName(e.target.value)}
                      placeholder="الاسم كما يظهر في الحساب"
                      className="h-11 rounded-xl mt-1.5"
                    />
                  </div>

                  {/* Sender account number */}
                  <div>
                    <Label htmlFor={senderNumberId}>رقم حساب المُرسِل *</Label>
                    <Input
                      id={senderNumberId}
                      value={senderAccountNumber}
                      onChange={(e) => setSenderAccountNumber(e.target.value)}
                      placeholder="رقم الحساب الذي حُوّل منه"
                      className="h-11 rounded-xl mt-1.5 text-left font-mono"
                      dir="ltr"
                    />
                  </div>

                  {/* Receipt upload — optional */}
                  <div>
                    <Label>صورة التحويل (اختياري)</Label>
                    <div className="flex items-center gap-2 mt-1.5">
                      <label
                        className="h-11 px-4 rounded-xl border border-border/30 flex items-center justify-center gap-2 hover:bg-accent cursor-pointer text-sm text-muted-foreground"
                        style={{
                          opacity: uploadingReceipt ? 0.5 : 1,
                          pointerEvents: uploadingReceipt ? "none" : "auto",
                        }}
                      >
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingReceipt}
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            setUploadingReceipt(true)
                            premiumToast("info", "جاري رفع الصورة...")
                            try {
                              const compressed = await compressImage(file)
                              const fd = new FormData()
                              fd.append("file", compressed, file.name.replace(/\.[^.]+$/, ".jpg"))
                              const r = await apiFetch("/api/upload", {
                                method: "POST",
                                body: fd,
                              })
                              const d = await r.json()
                              if (d.data?.url) setReceiptImageUrl(d.data.url)
                              else premiumToast("error", "فشل رفع الصورة")
                            } catch (err) {
                              premiumToast(
                                "error",
                                err instanceof Error ? err.message : "فشل رفع الصورة",
                              )
                            } finally {
                              setUploadingReceipt(false)
                            }
                          }}
                        />
                        {uploadingReceipt ? (
                          <Loader2 className="size-4 text-muted-foreground animate-spin" />
                        ) : (
                          <AnimatedUpload className="size-4 text-muted-foreground" />
                        )}
                        {uploadingReceipt ? "جاري الرفع..." : "اختر صورة"}
                      </label>
                      {receiptImageUrl && (
                        <button
                          type="button"
                          onClick={() => setReceiptImageUrl("")}
                          className="text-xs text-destructive hover:underline shrink-0"
                        >
                          حذف الصورة
                        </button>
                      )}
                    </div>
                    {receiptImageUrl && (
                      <div className="mt-2 rounded-md overflow-hidden size-20 border border-border/30">
                        <OptimizedImage
                          src={receiptImageUrl}
                          alt="صورة التحويل"
                          className="size-full"
                          skeleton={false}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {provider !== "bank" && (
                <div className="rounded-xl bg-muted/30 border border-border/20 p-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">المبلغ المطلوب</span>
                  <span className="text-lg font-bold text-orange">{price} د.ل</span>
                </div>
              )}

              <Button
                className="w-full h-12 text-base font-semibold rounded-xl"
                onClick={handleSent}
                disabled={submitting || (provider !== "bank" && !phone.trim())}
              >
                {submitting ? "جاري الإرسال..." : "إرسال طلب الدفع"}
              </Button>
            </>
          )}

          {step === "waiting" && (
            <div className="flex flex-col items-center py-10 space-y-6">
              {/* Animated payment indicator */}
              <div className="relative size-28">
                {/* Outer pulsing ring */}
                <div
                  className="absolute inset-0 rounded-full border-2 border-orange/20 animate-ping opacity-75"
                  style={{ animationDuration: "2s" }}
                />
                {/* Middle ring */}
                <div className="absolute inset-2 rounded-full border border-orange/30" />
                {/* Inner icon */}
                <div className="absolute inset-4 rounded-full bg-gradient-to-br from-orange to-orange/80 flex items-center justify-center shadow-lg shadow-orange/25">
                  <Smartphone className="size-8 text-white" />
                </div>
              </div>

              {/* Title */}
              <div className="text-center space-y-1.5">
                <p className="text-base font-bold">في انتظار تأكيد الدفع</p>
                <p className="text-xs text-muted-foreground max-w-[220px] mx-auto leading-relaxed">
                  &quot;بعد التحويل، انتظر موافقة الإدارة&quot;
                </p>
              </div>

              {/* Live status indicator */}
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/30 border border-border/20">
                <span className="relative flex size-2">
                  <span className="absolute inset-0 rounded-full bg-orange animate-ping opacity-75" />
                  <span className="relative rounded-full size-2 bg-orange" />
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {provider === "liyana" ? "بانتظار تأكيد التحويل" : "بانتظار موافقة الإدارة"}
                </span>
              </div>
            </div>
          )}

          {step === "approved" && (
            <div className="flex flex-col items-center py-8 space-y-6">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="relative size-20">
                <div
                  className="absolute inset-0 rounded-full bg-success/20 animate-ping opacity-75"
                  style={{ animationDuration: "1.5s" }}
                />
                <div className="relative size-full rounded-full bg-gradient-to-br from-success to-success/80 flex items-center justify-center shadow-lg shadow-success/30">
                  <CheckCircle2 className="size-10 text-success-foreground" />
                </div>
              </motion.div>
              <div className="text-center space-y-2">
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-lg font-bold text-success"
                >
                  تم الموافقة على الاشتراك
                </motion.p>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed"
                >
                  {resolutionMsg}
                </motion.p>
              </div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                <Button
                  className="w-full h-11 rounded-xl bg-success hover:bg-success/90 text-success-foreground"
                  onClick={() => {
                    onOpenChange(false)
                    onSuccess()
                  }}
                >
                  الانتقال إلى لوحة التحكم
                </Button>
              </motion.div>
            </div>
          )}

          {step === "rejected" && (
            <div className="flex flex-col items-center py-8 space-y-6">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="relative size-20">
                <div
                  className="absolute inset-0 rounded-full bg-destructive/20 animate-ping opacity-75"
                  style={{ animationDuration: "1.5s" }}
                />
                <div className="relative size-full rounded-full bg-gradient-to-br from-destructive to-destructive/80 flex items-center justify-center shadow-lg shadow-destructive/30">
                  <XCircle className="size-10 text-destructive-foreground" />
                </div>
              </motion.div>
              <div className="text-center space-y-2">
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-lg font-bold text-destructive"
                >
                  تم رفض طلب الاشتراك
                </motion.p>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed"
                >
                  {resolutionMsg}
                </motion.p>
              </div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="flex gap-2 w-full"
              >
                <Button
                  variant="outline"
                  className="flex-1 h-11 rounded-xl"
                  onClick={() => {
                    handleOpenChange(false)
                  }}
                >
                  إغلاق
                </Button>
                <Button
                  className="flex-1 h-11 rounded-xl"
                  onClick={() => {
                    setStep("form")
                    setResolutionMsg("")
                    setPhone("")
                    setBankAmount(price)
                    setSenderAccountName("")
                    setSenderAccountNumber("")
                    setReceiptImageUrl("")
                    setPaymentId(null)
                    sentRef.current = false
                  }}
                >
                  إعادة المحاولة
                </Button>
              </motion.div>
            </div>
          )}

          {/* Success screen — just acknowledge, don't redirect (payment is still pending) */}
          {step === "success" && (
            <div className="flex flex-col items-center py-8 space-y-6">
              <div className="relative size-20">
                <div className="absolute inset-0 rounded-full bg-success/10 animate-scale-in" />
                <div className="relative size-full rounded-full bg-gradient-to-br from-success/20 to-success/10 flex items-center justify-center">
                  <CheckCircle2 className="size-10 text-success" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-base font-bold">تم إرسال طلب الدفع</p>
                <p className="text-xs text-muted-foreground">سيتم تفعيل اشتراكك بعد موافقة الإدارة</p>
              </div>
              <Button
                className="w-full h-11 rounded-xl"
                variant="outline"
                onClick={() => {
                  handleOpenChange(false)
                }}
              >
                إغلاق
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

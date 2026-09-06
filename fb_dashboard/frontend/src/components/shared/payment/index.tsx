"use client"

/* v11-A3: PaymentDialog decomposed by concern into this folder —
   index.tsx (this file) keeps the state machine and orchestration only:
   - payment-constants.ts   Provider type, phone/bank fallbacks, labels
   - payment-methods.tsx    method tab rail (wallet wallets + bank)
   - payment-instructions.tsx  per-provider instruction panels & form fields
   - payment-status.tsx     waiting/approved/rejected/success screens
   - copy-field.tsx         copy-to-clipboard button + bank copy rows
   The public props signature is UNCHANGED; components/shared/PaymentDialog
   re-exports this component for the original import path. */

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

import { useState, useEffect, useCallback, useRef, useId } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { apiFetch, ApiError } from "@/lib/csrf-client"
import { premiumToast } from "@/lib/premium-toast"
import { Smartphone } from "lucide-react"
import { useConfig } from "@/hooks/useConfig"
import { compressImage } from "@/lib/image-compress"
import { PaymentMethodTabs } from "./payment-methods"
import { WalletInstructions, BankInstructions } from "./payment-instructions"
import { WaitingScreen, ApprovedScreen, RejectedScreen, SuccessScreen } from "./payment-status"
import type { Provider } from "./payment-constants"
import {
  DEFAULT_MADAR_PHONE,
  DEFAULT_LIBYANA_PHONE,
  DEFAULT_BANK_NAME,
  DEFAULT_BANK_ACCOUNT,
  DEFAULT_BANK_IBAN,
  LIBYANA_LABEL,
  MADAR_LABEL,
  COPY_SUCCESS_MESSAGE,
  COPY_ERROR_MESSAGE,
} from "./payment-constants"

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
  const { config } = useConfig()
  /* v10-D1 (S2 CRITICAL): the mobile-wallet ceiling comes from /api/config
   * (`mobile_wallet_cap`, admin-editable, arrives as a string) — the same key
   * the backend topup guard reads. No more hard-coded 99 drift in either
   * direction. Fallback 99 while the config loads / if the key is absent. */
  const capNumber = Number(config?.mobile_wallet_cap ?? 99)
  const walletCap = Number.isFinite(capNumber) && capNumber > 0 ? capNumber : 99
  // Mobile wallets (liyana/madar) cap at walletCap LYD — plans above that require bank transfer
  const requiresBank = Number(price) > walletCap
  // Auto-switch to bank when the plan exceeds the wallet cap
  useEffect(() => {
    if (requiresBank && (provider === "liyana" || provider === "madar")) {
      setProvider("bank")
    }
  }, [requiresBank, provider])
  const MADAR_PHONE = (config?.balance_transfer_phone_1 as string) || DEFAULT_MADAR_PHONE
  const LIBYANA_PHONE = (config?.balance_transfer_phone_2 as string) || DEFAULT_LIBYANA_PHONE

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
  const providerName = provider === "liyana" ? LIBYANA_LABEL : MADAR_LABEL

  // Bank account details from SystemConfig (same mechanism as the phones)
  const BANK_NAME = (config?.bank_transfer_bank_name as string) || DEFAULT_BANK_NAME
  const BANK_ACCOUNT = (config?.bank_transfer_account_number as string) || DEFAULT_BANK_ACCOUNT
  const BANK_IBAN = (config?.bank_transfer_iban as string) || DEFAULT_BANK_IBAN

  const quickTransferCode =
    provider === "liyana"
      ? `*122*218${LIBYANA_PHONE.slice(1)}*${price * 1000}*1#`
      : `*140*4*1*${price}*${MADAR_PHONE}#`

  const encodedUSSD = quickTransferCode.replace(/#/g, "%23")

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text)
      premiumToast("copy", COPY_SUCCESS_MESSAGE)
      return true
    } catch {
      premiumToast("error", COPY_ERROR_MESSAGE)
      return false
    }
  }

  // Receipt upload — compress client-side, POST to /api/upload, keep the URL
  const handleReceiptFileSelected = async (file: File) => {
    setUploadingReceipt(true)
    premiumToast("info", "جارٍ رفع الصورة...")
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
    if (!isBank && !/^09\d{8}$/.test(phone.trim().replace(/[\s-]/g, ""))) {
      premiumToast("error", "رقم الهاتف يجب أن يبدأ بـ 09 ويتكون من 10 أرقام (مثال: 0912345678)")
      return
    }
    if (!isBank && Number(price) <= 0) {
      premiumToast("error", "سعر الباقة غير صالح — أعد فتح نافذة الدفع")
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
      // v6 §D — anonymous visitor reached the payment step: plans are public,
      // payment is not. Send to login with a return path instead of a bare
      // error toast (the page no longer blanket-redirects on load).
      if (e instanceof ApiError && e.status === 401) {
        premiumToast("info", "سجّل الدخول أولاً لإتمام الاشتراك — سنعيدك هنا مباشرة")
        window.location.href = "/login?redirect=/subscribe"
        return
      }
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
            if (!res.ok) {
              // 401 (session expired) / 404 (payment gone) — polling forever
              // would hide the failure; treat like a poll failure.
              pollFailures++
              if (pollFailures >= 3) { onRejected("انتهت صلاحية الجلسة أو لم يعد الطلب موجوداً — حدّث الصفحة") }
              return
            }
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

  // Rejected → "إعادة المحاولة": back to the form with everything reset
  const handleRetry = () => {
    setStep("form")
    setResolutionMsg("")
    setPhone("")
    setBankAmount(price)
    setSenderAccountName("")
    setSenderAccountNumber("")
    setReceiptImageUrl("")
    setPaymentId(null)
    sentRef.current = false
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-md rounded-2xl p-0 gap-0 max-h-[90dvh] overflow-y-auto border-border/50 shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-br from-accent-foreground to-accent-foreground/80 text-white p-6">
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
          <div className="rounded-xl bg-accent/50 dark:bg-accent/20 border border-accent-foreground/15 p-4">
            <div className="flex justify-between items-center">
              <span className="font-bold">{planNameAr}</span>
              <span className="text-lg font-bold text-accent-foreground">{price} د.ل</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">اشتراك شهري</p>
          </div>

          {step === "form" && (
            <>
              {/* Payment method tabs */}
              <PaymentMethodTabs
                provider={provider}
                onProviderChange={setProvider}
                requiresBank={requiresBank}
                walletCap={walletCap}
              />

              {provider !== "bank" && (
                <WalletInstructions
                  providerName={providerName}
                  providerPhone={providerPhone}
                  quickTransferCode={quickTransferCode}
                  encodedUSSD={encodedUSSD}
                  onCopy={copyToClipboard}
                  phone={phone}
                  onPhoneChange={setPhone}
                />
              )}

              {/* Bank transfer section — replaces the mobile template entirely */}
              {provider === "bank" && (
                <BankInstructions
                  bankName={BANK_NAME}
                  bankAccount={BANK_ACCOUNT}
                  bankIban={BANK_IBAN}
                  onCopy={copyToClipboard}
                  bankAmountId={bankAmountId}
                  bankAmount={bankAmount}
                  onBankAmountChange={setBankAmount}
                  senderNameId={senderNameId}
                  senderAccountName={senderAccountName}
                  onSenderAccountNameChange={setSenderAccountName}
                  senderNumberId={senderNumberId}
                  senderAccountNumber={senderAccountNumber}
                  onSenderAccountNumberChange={setSenderAccountNumber}
                  receiptImageUrl={receiptImageUrl}
                  onReceiptImageUrlChange={setReceiptImageUrl}
                  uploadingReceipt={uploadingReceipt}
                  onReceiptFileSelected={handleReceiptFileSelected}
                />
              )}

              {provider !== "bank" && (
                <div className="rounded-xl bg-muted/30 border border-border/20 p-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">المبلغ المطلوب</span>
                  <span className="text-lg font-bold text-accent-foreground">{price} د.ل</span>
                </div>
              )}

              <Button
                className="w-full h-12 text-base font-semibold rounded-xl"
                onClick={handleSent}
                disabled={submitting || (provider !== "bank" && !phone.trim())}
              >
                {submitting ? "جارٍ الإرسال..." : "إرسال طلب الدفع"}
              </Button>
            </>
          )}

          {step === "waiting" && <WaitingScreen provider={provider} />}

          {step === "approved" && (
            <ApprovedScreen
              resolutionMsg={resolutionMsg}
              onContinue={() => {
                onOpenChange(false)
                onSuccess()
              }}
            />
          )}

          {step === "rejected" && (
            <RejectedScreen
              resolutionMsg={resolutionMsg}
              onClose={() => handleOpenChange(false)}
              onRetry={handleRetry}
            />
          )}

          {/* Success screen — just acknowledge, don't redirect (payment is still pending) */}
          {step === "success" && <SuccessScreen onClose={() => handleOpenChange(false)} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

"use client"

/* v11-A3: extracted from PaymentDialog.tsx — the per-provider instruction
   panels and form sections of the "form" step:
   - WalletInstructions (provider !== "bank"): provider phone card with
     copy, USSD quick-transfer card with the copy+dial one-tap, and the
     subscriber phone input.
   - BankInstructions (provider === "bank"): bank account card with
     per-row copy, amount, sender name/number inputs and the optional
     receipt upload (upload logic itself stays in the dialog). */

import { useId } from "react"
import { Landmark, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import AnimatedUpload from "@/components/ui/upload-icon"
import AnimatedCopy from "@/components/ui/copy-icon"
import { OptimizedImage } from "@/components/ui/OptimizedImage"
import { CopyIconButton, CopyRow } from "./copy-field"
import {
  BANK_NAME_ROW_LABEL,
  BANK_ACCOUNT_ROW_LABEL,
  BANK_IBAN_ROW_LABEL,
} from "./payment-constants"

interface WalletInstructionsProps {
  providerName: string
  providerPhone: string
  quickTransferCode: string
  encodedUSSD: string
  /** v12-E4.11: false → the encoded payload failed the USSD charset guard;
   *  copy still works, the dialer is not opened. */
  ussdSafe: boolean
  onCopy: (text: string) => Promise<boolean>
  phone: string
  onPhoneChange: (phone: string) => void
}

export function WalletInstructions({
  providerName,
  providerPhone,
  quickTransferCode,
  encodedUSSD,
  ussdSafe,
  onCopy,
  phone,
  onPhoneChange,
}: WalletInstructionsProps) {
  return (
    <>
      {/* Provider phone */}
      <div className="rounded-xl bg-muted/30 border border-border/20 p-3">
        <p className="text-xs text-muted-foreground mb-1">أرسل المبلغ إلى {providerName}</p>
        <div className="flex items-center justify-between">
          <span className="font-bold text-lg tracking-wide font-mono" dir="ltr">
            {providerPhone}
          </span>
          <CopyIconButton
            onCopy={() => onCopy(providerPhone)}
            title="نسخ الرقم"
            ariaLabel="نسخ الرقم"
            iconClassName="size-3.5"
          />
        </div>
      </div>

      {/* Quick transfer code */}
      <div className="rounded-xl bg-success/10 border border-success/25 p-3">
        <p className="text-xs font-medium text-success mb-1.5">رمز التحويل السريع</p>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-bold text-accent-foreground truncate" dir="ltr">
            {quickTransferCode}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* One-tap: copy the code, then open the dialer (only on copy success) */}
            <button
              type="button"
              onClick={async () => {
                const ok = await onCopy(quickTransferCode)
                /* v12-E4.11: open the dialer only when the encoded payload
                 * passed the USSD charset guard (see PaymentDialog). */
                if (!ok || !ussdSafe) return
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
        <Label htmlFor="payment-phone">رقم هاتفك *</Label>
        <Input
          id="payment-phone"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="09XXXXXXXX"
          inputMode="numeric"
          autoComplete="tel"
          required
          maxLength={10}
          className="h-11 rounded-xl mt-1.5 text-left font-mono"
          dir="ltr"
        />
        <p className="text-2xs text-muted-foreground mt-1">
          10 أرقام تبدأ بـ 09 — حتى نتمكن من التأكد من استلام التحويل
        </p>
      </div>
    </>
  )
}

interface BankInstructionsProps {
  bankName: string
  bankAccount: string
  bankIban: string
  onCopy: (text: string) => Promise<boolean>
  bankAmountId: string
  bankAmount: number
  onBankAmountChange: (amount: number) => void
  senderNameId: string
  senderAccountName: string
  onSenderAccountNameChange: (name: string) => void
  senderNumberId: string
  senderAccountNumber: string
  onSenderAccountNumberChange: (number: string) => void
  receiptImageUrl: string
  onReceiptImageUrlChange: (url: string) => void
  uploadingReceipt: boolean
  onReceiptFileSelected: (file: File) => void
}

export function BankInstructions({
  bankName,
  bankAccount,
  bankIban,
  onCopy,
  bankAmountId,
  bankAmount,
  onBankAmountChange,
  senderNameId,
  senderAccountName,
  onSenderAccountNameChange,
  senderNumberId,
  senderAccountNumber,
  onSenderAccountNumberChange,
  receiptImageUrl,
  onReceiptImageUrlChange,
  uploadingReceipt,
  onReceiptFileSelected,
}: BankInstructionsProps) {
  const bankRows = [
    { label: BANK_NAME_ROW_LABEL, value: bankName },
    { label: BANK_ACCOUNT_ROW_LABEL, value: bankAccount },
    { label: BANK_IBAN_ROW_LABEL, value: bankIban },
  ]

  /* v14-E4 (C-A11Y1): stable id tying the visible upload label to the
   * sr-only file input (accessible name + click/keyboard activation). */
  const receiptInputId = useId()

  return (
    <>
      {/* Bank account info card */}
      <div className="rounded-xl bg-muted/30 border border-border/20 p-3 space-y-2.5">
        <p className="text-xs font-medium flex items-center gap-1.5">
          <Landmark className="size-3.5 text-accent-foreground" />
          حوّل على الحساب البنكي التالي
        </p>
        {bankRows.map((row) => (
          <CopyRow key={row.label} label={row.label} value={row.value} onCopy={onCopy} />
        ))}
      </div>

      {/* Bank amount — no wallet cap (server enforces plan price) */}
      <div>
        <Label htmlFor={bankAmountId}>المبلغ (د.ل)</Label>
        {/* v12-E4.14: type="text" + inputMode="decimal" — numeric keyboards
            still show, but the field no longer submits a locale-formatted
            shadow value; the onChange Number() guard below stays the
            validation seam (rejects NaN/negatives). */}
        <Input
          id={bankAmountId}
          type="text"
          inputMode="decimal"
          value={bankAmount}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (isNaN(v) || v < 0) return
            onBankAmountChange(v)
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
          onChange={(e) => onSenderAccountNameChange(e.target.value)}
          placeholder="الاسم كما يظهر في الحساب"
          autoComplete="name"
          required
          className="h-11 rounded-xl mt-1.5"
        />
      </div>

      {/* Sender account number */}
      <div>
        <Label htmlFor={senderNumberId}>رقم حساب المُرسِل *</Label>
        <Input
          id={senderNumberId}
          value={senderAccountNumber}
          onChange={(e) => onSenderAccountNumberChange(e.target.value)}
          placeholder="رقم الحساب الذي حُوّل منه"
          className="h-11 rounded-xl mt-1.5 text-left font-mono"
          dir="ltr"
        />
      </div>

      {/* Receipt upload — optional */}
      <div>
        <Label>صورة التحويل (اختياري)</Label>
        <div className="flex items-center gap-2 mt-1.5">
          {/* v14-E4 (C-A11Y1 / D4 C-01, WCAG 2.1.1 Level A): the input used
              to be `hidden` inside a non-focusable label — display:none put
              it outside the tab order and the AT tree, so the receipt upload
              was mouse-only. Standard sr-only + peer pattern instead: the
              input stays focusable (Enter/Space open the picker natively),
              takes its accessible name from the htmlFor label, and
              peer-focus-visible lights the visible label up so keyboard
              users see WHERE they are. */}
          <input
            type="file"
            id={receiptInputId}
            accept="image/*"
            className="sr-only peer"
            disabled={uploadingReceipt}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              onReceiptFileSelected(file)
            }}
          />
          <label
            htmlFor={receiptInputId}
            className="h-11 px-4 rounded-xl border border-border/30 flex items-center justify-center gap-2 hover:bg-accent cursor-pointer text-sm text-muted-foreground peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-accent-foreground/50 peer-focus-visible:border-accent-foreground/40 peer-disabled:pointer-events-none peer-disabled:opacity-50"
          >
            {uploadingReceipt ? (
              <Loader2 className="size-4 text-muted-foreground animate-spin" />
            ) : (
              <AnimatedUpload className="size-4 text-muted-foreground" />
            )}
            {uploadingReceipt ? "جارٍ الرفع…" : "اختر صورة"}
          </label>
          {receiptImageUrl && (
            <button
              type="button"
              onClick={() => onReceiptImageUrlChange("")}
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
  )
}

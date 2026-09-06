"use client"

/* v11-A3: extracted from PaymentDialog.tsx — the per-provider instruction
   panels and form sections of the "form" step:
   - WalletInstructions (provider !== "bank"): provider phone card with
     copy, USSD quick-transfer card with the copy+dial one-tap, and the
     subscriber phone input.
   - BankInstructions (provider === "bank"): bank account card with
     per-row copy, amount, sender name/number inputs and the optional
     receipt upload (upload logic itself stays in the dialog). */

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
  onCopy: (text: string) => Promise<boolean>
  phone: string
  onPhoneChange: (phone: string) => void
}

export function WalletInstructions({
  providerName,
  providerPhone,
  quickTransferCode,
  encodedUSSD,
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
        <Input
          id={bankAmountId}
          type="number"
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
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                onReceiptFileSelected(file)
              }}
            />
            {uploadingReceipt ? (
              <Loader2 className="size-4 text-muted-foreground animate-spin" />
            ) : (
              <AnimatedUpload className="size-4 text-muted-foreground" />
            )}
            {uploadingReceipt ? "جارٍ الرفع..." : "اختر صورة"}
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

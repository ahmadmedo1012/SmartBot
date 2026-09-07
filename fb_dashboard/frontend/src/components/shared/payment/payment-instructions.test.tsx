/**
 * v13-E6 — per-provider payment instruction panels (v11-A3 extraction).
 *
 * WalletInstructions pins: the provider phone card (LTR mono), the USSD
 * quick-transfer card with the "نسخ واتصال" one-tap (which must await the
 * copy result), and the subscriber phone input contract (inputMode=numeric,
 * maxLength=10, required, per-keystroke onPhoneChange).
 * BankInstructions pins: the three copy rows, the Number() amount guard
 * (NaN/negative never call back), the sender fields, the upload-pending
 * state and the receipt delete affordance.
 *
 * OptimizedImage is mocked (plain img) to drop next/image from the tree —
 * D8's documented recipe for jsdom render tests.
 */
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { BankInstructions, WalletInstructions } from "./payment-instructions"

vi.mock("@/components/ui/OptimizedImage", () => ({
  OptimizedImage: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}))

function walletProps(overrides: Partial<Parameters<typeof WalletInstructions>[0]> = {}) {
  return {
    providerName: "ليبيانا",
    providerPhone: "0942119637",
    quickTransferCode: "*122*218942119637*19000*1#",
    encodedUSSD: "*122*218942119637*19000*1%23",
    ussdSafe: true,
    // resolving false keeps the dialer path closed in these unit tests
    onCopy: vi.fn(async (): Promise<boolean> => false),
    phone: "",
    onPhoneChange: vi.fn(),
    ...overrides,
  }
}

describe("WalletInstructions", () => {
  it("renders the provider phone card with an LTR monospace number", () => {
    render(<WalletInstructions {...walletProps()} />)

    expect(screen.getByText("أرسل المبلغ إلى ليبيانا")).toBeInTheDocument()
    const phone = screen.getByText("0942119637")
    expect(phone).toHaveAttribute("dir", "ltr")
    expect(phone).toHaveClass("font-mono")
  })

  it("renders the quick-transfer code card with an LTR code", () => {
    render(<WalletInstructions {...walletProps()} />)

    expect(screen.getByText("رمز التحويل السريع")).toBeInTheDocument()
    const code = screen.getByText("*122*218942119637*19000*1#")
    expect(code).toHaveAttribute("dir", "ltr")
  })

  it('copies the code through the "نسخ واتصال" one-tap button', async () => {
    // v13: fake clock — the dialer setTimeout(150ms) must be captured and
    // discarded here. Firing after test end hit jsdom's unimplemented
    // navigation → the intermittent unhandled processTimers error.
    vi.useFakeTimers()
    try {
      const onCopy = vi.fn(async (): Promise<boolean> => true)
      render(<WalletInstructions {...walletProps({ onCopy })} />)

      const btn = screen.getByRole("button", { name: /نسخ واتصال/ })
      expect(btn).toHaveAttribute("title", "نسخ الرمز وفتح الاتصال")

      fireEvent.click(btn)
      // flush the async onClick so the assertion below is deterministic
      await act(async () => { await Promise.resolve() })
      expect(onCopy).toHaveBeenCalledWith("*122*218942119637*19000*1#")
      // the pending dialer timer lives on the FAKE clock — cleared below,
      // never fires, no post-test navigation attempt
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it("contracts the subscriber phone input: numeric keypad, 10 digits, required", () => {
    render(<WalletInstructions {...walletProps()} />)

    const input = screen.getByLabelText("رقم هاتفك *")
    expect(input).toHaveAttribute("inputmode", "numeric")
    expect(input).toHaveAttribute("maxlength", "10")
    expect(input).toHaveAttribute("required", "")
    expect(input).toHaveAttribute("autocomplete", "tel")
    expect(input).toHaveAttribute("placeholder", "09XXXXXXXX")
    expect(input).toHaveAttribute("dir", "ltr")
    expect(screen.getByText(/10 أرقام تبدأ بـ 09/)).toBeInTheDocument()
  })

  it("reports every keystroke through onPhoneChange", () => {
    const onPhoneChange = vi.fn()
    render(<WalletInstructions {...walletProps({ onPhoneChange })} />)

    fireEvent.change(screen.getByLabelText("رقم هاتفك *"), { target: { value: "091" } })
    expect(onPhoneChange).toHaveBeenCalledWith("091")

    fireEvent.change(screen.getByLabelText("رقم هاتفك *"), { target: { value: "0912" } })
    expect(onPhoneChange).toHaveBeenCalledWith("0912")
  })
})

function bankProps(overrides: Partial<Parameters<typeof BankInstructions>[0]> = {}) {
  return {
    bankName: "مصرف الوحدة",
    bankAccount: "0021-004-998877",
    bankIban: "LY83002048000020100120361",
    onCopy: vi.fn(async (): Promise<boolean> => true),
    bankAmountId: "bank-amount",
    bankAmount: 19,
    onBankAmountChange: vi.fn(),
    senderNameId: "sender-name",
    senderAccountName: "",
    onSenderAccountNameChange: vi.fn(),
    senderNumberId: "sender-number",
    senderAccountNumber: "",
    onSenderAccountNumberChange: vi.fn(),
    receiptImageUrl: "",
    onReceiptImageUrlChange: vi.fn(),
    uploadingReceipt: false,
    onReceiptFileSelected: vi.fn(),
    ...overrides,
  }
}

describe("BankInstructions", () => {
  it("renders the three bank detail rows with their values", () => {
    render(<BankInstructions {...bankProps()} />)

    expect(screen.getByText("حوّل على الحساب البنكي التالي")).toBeInTheDocument()
    expect(screen.getByText("مصرف الوحدة")).toBeInTheDocument()
    expect(screen.getByText("0021-004-998877")).toBeInTheDocument()
    expect(screen.getByText("LY83002048000020100120361")).toBeInTheDocument()
    // each row exposes its copy affordance
    expect(screen.getByRole("button", { name: "نسخ المصرف" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "نسخ رقم الحساب" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "نسخ IBAN" })).toBeInTheDocument()
  })

  it("guards the amount: 'abc' and '-5' never call, '120' calls with 120", () => {
    const onBankAmountChange = vi.fn()
    render(<BankInstructions {...bankProps({ onBankAmountChange })} />)
    const input = screen.getByLabelText("المبلغ (د.ل)")

    fireEvent.change(input, { target: { value: "abc" } })
    expect(onBankAmountChange).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: "-5" } })
    expect(onBankAmountChange).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: "120" } })
    expect(onBankAmountChange).toHaveBeenCalledWith(120)
  })

  it("wires the sender name and account number fields", () => {
    const onSenderAccountNameChange = vi.fn()
    const onSenderAccountNumberChange = vi.fn()
    render(
      <BankInstructions
        {...bankProps({ onSenderAccountNameChange, onSenderAccountNumberChange })}
      />,
    )

    const nameInput = screen.getByLabelText("اسم صاحب الحساب المُرسِل *")
    expect(nameInput).toHaveAttribute("required", "")
    fireEvent.change(nameInput, { target: { value: "محمد علي" } })
    expect(onSenderAccountNameChange).toHaveBeenCalledWith("محمد علي")

    const numberInput = screen.getByLabelText("رقم حساب المُرسِل *")
    expect(numberInput).toHaveAttribute("dir", "ltr")
    fireEvent.change(numberInput, { target: { value: "998877" } })
    expect(onSenderAccountNumberChange).toHaveBeenCalledWith("998877")
  })

  it("shows the upload-pending state and disables the file input while uploading", () => {
    const { container } = render(<BankInstructions {...bankProps({ uploadingReceipt: true })} />)

    expect(screen.getByText("جارٍ الرفع…")).toBeInTheDocument()
    expect(screen.queryByText("اختر صورة")).toBeNull()
    const fileInput = container.querySelector("input[type='file']") as HTMLInputElement
    expect(fileInput).toBeDisabled()
  })

  it("offers the idle upload affordance when not uploading", () => {
    render(<BankInstructions {...bankProps({ uploadingReceipt: false })} />)

    expect(screen.getByText("اختر صورة")).toBeInTheDocument()
    expect(screen.queryByText("جارٍ الرفع…")).toBeNull()
  })

  it("shows the receipt preview (mocked img) and deletes it on demand", () => {
    const onReceiptImageUrlChange = vi.fn()
    render(
      <BankInstructions {...bankProps({ receiptImageUrl: "/receipts/1.jpg", onReceiptImageUrlChange })} />,
    )

    const img = screen.getByAltText("صورة التحويل")
    expect(img).toHaveAttribute("src", "/receipts/1.jpg")

    fireEvent.click(screen.getByRole("button", { name: "حذف الصورة" }))
    expect(onReceiptImageUrlChange).toHaveBeenCalledWith("")
  })

  it("renders no preview and no delete button without a receipt", () => {
    render(<BankInstructions {...bankProps({ receiptImageUrl: "" })} />)

    expect(screen.queryByAltText("صورة التحويل")).toBeNull()
    expect(screen.queryByRole("button", { name: "حذف الصورة" })).toBeNull()
  })
})

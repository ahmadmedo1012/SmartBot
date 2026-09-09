/**
 * v17-E-F12 — AiSuggestDialog state contract (presentational half).
 *
 * The dialog receives the /api/ai/suggest mutation state as props (the page
 * owns the request), so these tests pin the four documented surfaces:
 *   - pending: spinner + «جارٍ توليد الاقتراحات…», never a suggestion list
 *   - success: 1-3 suggestions + meta chips, «إدراج» emits the exact text
 *   - error: the Arabic ApiError detail in role="alert" + retry
 *   - honest empty: success with zero usable suggestions says so + retry
 *   - Escape closes via the shared dialog.tsx (base-ui) → onOpenChange(false)
 *
 * Mock bundle: none needed beyond render — no fetch, no router context
 * (house precedent: PaymentDialog smoke tests render base-ui Dialog as-is).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AiSuggestDialog, type AiSuggestDialogProps } from "./AiSuggestDialog"

function renderDialog(props: Partial<AiSuggestDialogProps> = {}) {
  const handlers = {
    onOpenChange: vi.fn(),
    onRetry: vi.fn(),
    onInsert: vi.fn(),
  }
  const base: AiSuggestDialogProps = {
    open: true,
    commentText: "شحال سعر التوصيل؟",
    commenterName: "أحمد",
    pending: false,
    error: null,
    result: null,
    ...handlers,
    ...props,
  }
  render(<AiSuggestDialog {...base} />)
  return handlers
}

describe("AiSuggestDialog — pending state", () => {
  it("shows the spinner row and never a suggestion/insert button", () => {
    renderDialog({ pending: true })

    expect(screen.getByRole("status")).toHaveTextContent("جارٍ توليد الاقتراحات…")
    expect(screen.queryByRole("listitem")).toBeNull()
    expect(screen.queryByRole("button", { name: "إدراج الاقتراح 1 في مسودة الرد" })).toBeNull()
  })
})

describe("AiSuggestDialog — suggestions state", () => {
  it("renders the source comment + 1-3 suggestions + intent/sentiment chips", () => {
    renderDialog({
      result: {
        suggestions: ["رد أول جاهز", "رد ثانٍ جاهز"],
        intent: "استفسار",
        sentiment: "محايد",
      },
    })

    // the quoted source comment (dir="auto" live value) is shown verbatim
    expect(screen.getByText("شحال سعر التوصيل؟")).toBeInTheDocument()
    expect(screen.getByText("رد أول جاهز")).toBeInTheDocument()
    expect(screen.getByText("رد ثانٍ جاهز")).toBeInTheDocument()
    expect(screen.getByText("النية: استفسار")).toBeInTheDocument()
    expect(screen.getByText("النبرة: محايد")).toBeInTheDocument()
  })

  it("«إدراج» emits the exact chosen text to the page", () => {
    const { onInsert } = renderDialog({
      result: { suggestions: ["رد أول جاهز", "رد ثانٍ جاهز"] },
    })

    fireEvent.click(screen.getByRole("button", { name: "إدراج الاقتراح 2 في مسودة الرد" }))
    expect(onInsert).toHaveBeenCalledTimes(1)
    expect(onInsert).toHaveBeenCalledWith("رد ثانٍ جاهز")
  })

  it("drops non-string/empty entries defensively (contract says strings)", () => {
    renderDialog({
      result: {
        // @ts-expect-error — deliberately malformed payload shape
        suggestions: ["رد سليم", "", null, 42],
      },
    })

    expect(screen.getByText("رد سليم")).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
  })
})

describe("AiSuggestDialog — error state", () => {
  it("surfaces the backend's Arabic detail in role=alert and retries", () => {
    const { onRetry } = renderDialog({ error: "AI غير مفعل — قم بتعيين OPENAI_API_KEY" })

    expect(screen.getByRole("alert")).toHaveTextContent("AI غير مفعل")
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe("AiSuggestDialog — honest empty state", () => {
  it("a 200 with zero usable suggestions says so instead of a blank dialog", () => {
    const { onRetry } = renderDialog({ result: { suggestions: [] } })

    expect(
      screen.getByText("لم يصل أي اقتراح — جرّب مرة أخرى أو اكتب الرد يدويًا."),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe("AiSuggestDialog — close affordances (shared dialog.tsx)", () => {
  it("the built-in close button calls onOpenChange(false)", () => {
    const { onOpenChange } = renderDialog({ result: { suggestions: ["رد"] } })

    fireEvent.click(screen.getByRole("button", { name: "إغلاق" }))
    /* base-ui يمرر تفاصيل الحدث كوسيط ثانٍ — الجوهر is false */
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything())
  })

  it("Escape closes the modal (base-ui native keydown)", async () => {
    const { onOpenChange } = renderDialog({ result: { suggestions: ["رد"] } })

    fireEvent.keyDown(document.body, { key: "Escape" })
    await waitFor(() =>
      /* base-ui يمرر تفاصيل الحدث كوسيط ثانٍ — الجوهر is false */
      expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything()),
    )
  })
})

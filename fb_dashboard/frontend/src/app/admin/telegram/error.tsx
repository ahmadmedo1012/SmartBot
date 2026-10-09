"use client"

import { DefaultError } from "@/components/shared/DefaultError"

/* r131-F7 (A4 P2-8): the admin/telegram boundary joins the ONE .state
 * family via DefaultError (was a standalone glass card + destructive
 * gradient — the third error skin this wave retires). Custom Arabic copy
 * kept through the title/description props. */
export default function AdminTelegramError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <DefaultError
      error={error}
      reset={reset}
      title="حدث خطأ في إعدادات تليجرام"
      description="تعذّر تحميل إعدادات تليجرام. يرجى المحاولة مرة أخرى، وإن استمرت المشكلة تواصل مع فريق الدعم."
    />
  )
}

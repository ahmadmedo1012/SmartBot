/**
 * useMutationFeedback — wraps fetch mutations with toast + optional confirm dialog.
 * Usage:
 *   const { mutate, loading } = useMutationFeedback({
 *     action: () => fetch("/api/rules/1", { method: "DELETE" }),
 *     confirmTitle: "حذف القاعدة",
 *     confirmMessage: "هل أنت متأكد؟",
 *     onSuccess: () => refetch(),
 *   })
 */
import { useState, useCallback } from "react"
import { toast } from "sonner"

export function useMutationFeedback({ action, confirmTitle, confirmMessage: _confirmMsg, onSuccess, onError, successMsg } = {}) {
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)

  const execute = useCallback(async (skipConfirm = false) => {
    if (confirmTitle && !skipConfirm) {
      setConfirmOpen(true)
      return
    }
    setLoading(true)
    try {
      const res = await action()
      const data = res.ok ? await res.json().catch(() => ({})) : await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || "فشل العملية")
      toast.success(successMsg || "تم بنجاح ✅")
      onSuccess?.(data)
    } catch (err) {
      toast.error(err.message || "حدث خطأ")
      onError?.(err)
    } finally {
      setLoading(false)
      setConfirmOpen(false)
    }
  }, [action, confirmTitle, onSuccess, onError, successMsg])

  const mutate = useCallback(() => execute(false), [execute])
  const confirm = useCallback(() => execute(true), [execute])

  return { mutate, loading, confirmOpen, setConfirmOpen, confirm, pendingAction }
}

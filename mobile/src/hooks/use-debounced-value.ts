/**
 * SmartBot Mobile — قيمة مؤجّلة (debounce).
 *
 * تُستخدم لحقول البحث قبل دخولها queryKey (M-20): كل ضغطة مفتاح لا
 * يجب أن تطلق طلب API جديدًا. 400ms هو الإيقاع المعتمد في الويب.
 */
import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

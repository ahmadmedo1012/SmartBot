"use client"
import { DefaultError } from "@/components/shared/DefaultError"
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <DefaultError error={error} reset={reset} />
}

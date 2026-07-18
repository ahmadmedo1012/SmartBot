"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AdminTelegramError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => { console.error(error?.message || "Telegram admin error") }, [error])

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 via-background to-primary/5" />
      <div className="relative z-10 flex flex-col items-center text-center px-6 animate-fade-in">
        <div className="relative mb-8">
          <div className="size-24 rounded-full glass flex items-center justify-center mx-auto">
            <AlertTriangle className="size-12 text-destructive" />
          </div>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-4">حدث خطأ في إعدادات تليجرام</h1>
        <p className="text-lg text-muted-foreground max-w-md mb-8 leading-relaxed">يرجى المحاولة مرة أخرى</p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button size="lg" className="text-base px-8 h-12" onClick={() => reset()}>
            إعادة المحاولة
          </Button>
          <a href="/admin">
            <Button variant="outline" size="lg" className="text-base px-8 h-12">
              العودة للوحة التحكم
            </Button>
          </a>
        </div>
      </div>
    </div>
  )
}

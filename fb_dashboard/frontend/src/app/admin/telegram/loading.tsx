import { Loader2 } from "lucide-react"

export default function AdminTelegramLoading() {
  return (
    <div className="flex items-center justify-center py-20" aria-live="polite">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

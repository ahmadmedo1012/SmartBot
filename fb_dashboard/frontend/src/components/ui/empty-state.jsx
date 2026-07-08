import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Inbox } from "lucide-react"

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={cn("flex flex-col items-center justify-center py-16 text-center", className)}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/40 mb-4">
        <Icon className="size-7 text-muted-foreground/40" />
      </div>
      {title && <p className="text-sm font-medium text-foreground mb-1">{title}</p>}
      {description && <p className="text-xs text-muted-foreground max-w-xs mb-6">{description}</p>}
      {action && action}
    </motion.div>
  )
}

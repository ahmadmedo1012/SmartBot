import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Inbox } from "lucide-react"

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn("flex flex-col items-center justify-center py-12 text-center px-4", className)}
    >
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted/40 backdrop-blur-sm mb-4 ring-1 ring-border/20">
        <Icon className="size-6 text-muted-foreground/40" />
      </div>
      {title && <p className="text-sm font-medium text-foreground mb-1">{title}</p>}
      {description && <p className="text-xs text-muted-foreground max-w-xs mb-5 leading-relaxed">{description}</p>}
      {action && <div>{action}</div>}
    </motion.div>
  )
}

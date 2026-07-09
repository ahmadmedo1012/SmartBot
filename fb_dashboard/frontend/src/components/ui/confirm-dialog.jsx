import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "./button"

export function ConfirmDialog({ open, onClose, onConfirm, title = "تأكيد", message = "هل أنت متأكد؟", loading = false, destructive = false }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-sm rounded-2xl bg-card border shadow-xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className={`size-10 rounded-xl flex items-center justify-center ${destructive ? "bg-destructive/10" : "bg-warning/10"}`}>
                <AlertTriangle className={`size-5 ${destructive ? "text-destructive" : "text-warning"}`} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{message}</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>إلغاء</Button>
              <Button variant={destructive ? "destructive" : "default"} size="sm" onClick={onConfirm} disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin ml-1" /> : null}
                {loading ? "جاري..." : "تأكيد"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

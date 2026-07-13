import { motion, useReducedMotion } from "framer-motion"

const icons = {
  empty: <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" style={{ opacity: 0.3 }}><rect x="6" y="10" width="36" height="28" rx="3"/><path d="M6 18h36"/><circle cx="14" cy="14" r="2"/><circle cx="20" cy="14" r="2"/></svg>,
  error: <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" style={{ opacity: 0.5, color: "var(--danger)" }}><circle cx="24" cy="24" r="20"/><path d="M24 16v8"/><path d="M24 28v.01"/></svg>,
  loading: <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />,
}

export function PageState({ state, title, message, action }) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0 }}
      animate={{ opacity: 1 }}
      className="page active"
      dir="rtl"
    >
      <div className="page-header" />
      <div className="empty-state">
        {icons[state] || icons.empty}
        {title && <h2>{title}</h2>}
        {message && <p>{message}</p>}
        {action && (
          <button type="button" className="btn btn-primary" onClick={action.onClick} style={{ marginBlockStart: 8 }}>
            {action.label}
          </button>
        )}
      </div>
    </motion.div>
  )
}

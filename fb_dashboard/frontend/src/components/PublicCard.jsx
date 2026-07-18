export function PublicCard({ children, variant, hover, ...props }) {
  const base = {
    borderRadius: 'var(--radius-md)',
    transform: 'translateZ(0)',
    transition: 'all .3s cubic-bezier(.165,.84,.44,1)',
  }
  if (variant === 'glass') {
    base.background = 'var(--glass-bg)'
    base.backdropFilter = 'blur(32px) saturate(1.4)'
    base.WebkitBackdropFilter = 'blur(32px) saturate(1.4)'
    base.border = '1px solid var(--glass-border)'
    base.boxShadow = 'var(--glass-shadow)'
  } else {
    base.background = 'var(--card)'
    base.border = '1px solid var(--border)'
    base.boxShadow = 'var(--shadow-sm)'
  }
  // ponytail: hover state requires CSS class or JS listener; skip inline hover for now
  return <div style={base} {...props}>{children}</div>
}

import { forwardRef } from 'react'

export const OrangeButton = forwardRef(({ children, loading, disabled, ...props }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
      whiteSpace: 'nowrap', borderRadius: 'var(--radius-sm)',
      fontSize: '0.8125rem', fontWeight: 500, lineHeight: 1,
      height: '2.5rem', padding: '0 1rem',
      background: 'var(--orange)', color: 'var(--orange-foreground)',
      border: 0, cursor: disabled || loading ? 'not-allowed' : 'pointer',
      opacity: disabled || loading ? 0.45 : 1,
      transition: 'background .12s, color .12s, opacity .12s',
    }}
    {...props}
  >
    {loading && (
      <span style={{
        width: 16, height: 16,
        border: '2px solid currentColor', borderTopColor: 'transparent',
        borderRadius: '50%', animation: 'spin .6s linear infinite',
        flexShrink: 0,
      }} />
    )}
    {children}
  </button>
))
OrangeButton.displayName = 'OrangeButton'

export function Eyebrow({ children, ...props }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
        borderRadius: 9999, border: '1px solid color-mix(in oklch, var(--orange) 20%, transparent)',
        background: 'color-mix(in oklch, var(--orange) 5%, transparent)',
        padding: '0.25rem 1rem', fontSize: '0.65rem', fontWeight: 500, color: 'var(--orange)',
      }}
      {...props}
    >
      {children}
    </span>
  )
}

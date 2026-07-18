import { Eyebrow } from './Eyebrow'

export function SectionHeader({ eyebrow, title, subtitle, icon, ...props }) {
  return (
    <div style={{ textAlign: 'center', marginBlockEnd: '4rem' }} {...props}>
      {eyebrow && (
        <Eyebrow>
          {icon}{eyebrow}
        </Eyebrow>
      )}
      {title && (
        <h2 style={{
          fontSize: '1.875rem', fontWeight: 800, marginBlockEnd: '1rem',
          letterSpacing: '-0.02em',
        }}>
          {title}
        </h2>
      )}
      {subtitle && (
        <p style={{
          fontSize: '0.9375rem', maxWidth: 640, margin: '0 auto',
          color: 'var(--muted-foreground)',
        }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}

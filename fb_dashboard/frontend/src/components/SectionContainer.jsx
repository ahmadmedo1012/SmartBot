export function SectionContainer({ children, ...props }) {
  return (
    <section
      style={{ position: 'relative', paddingBlock: '3rem', overflow: 'hidden' }}
      {...props}
    >
      <div style={{ position: 'relative', zIndex: 10, maxWidth: 1220, marginInline: 'auto', paddingInline: '1rem' }}>
        {children}
      </div>
    </section>
  )
}

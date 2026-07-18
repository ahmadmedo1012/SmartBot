export function GlowPool({ position, size = '20rem', color = 'orange', ...props }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute', borderRadius: '50%', pointerEvents: 'none', zIndex: 0,
        filter: 'blur(100px)',
        background: `radial-gradient(circle, color-mix(in oklch, var(--${color}) 30%, transparent) 0%, transparent 70%)`,
        width: size, height: size,
        ...(position ? { top: 0, [position.includes('right') ? 'right' : 'left']: 0 } : { top: 0, left: 0 }),
      }}
      {...props}
    />
  )
}

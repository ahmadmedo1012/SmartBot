export function AnnualToggle({ annual, onChange }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-4">
      <span className="text-sm font-medium" style={{ color: !annual ? "var(--fg)" : "var(--muted)" }}>شهري</span>
      <button
        onClick={() => onChange(!annual)}
        className="relative w-14 h-7 rounded-full transition-all duration-300"
        style={{ background: annual ? "var(--accent)" : "var(--border)" }}>
        <div className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all duration-300 shadow-sm"
          style={{ left: annual ? "calc(100% - 26px)" : "2px" }} />
      </button>
      <span className="text-sm font-medium" style={{ color: annual ? "var(--fg)" : "var(--muted)" }}>
        سنوي
        <span className="mr-1.5 text-xs px-1.5 py-0.5 rounded-full" style={{ background: "color-mix(in oklch, var(--success) 20%, transparent)", color: "var(--success)" }}>وفر شهرين</span>
      </span>
    </div>
  )
}

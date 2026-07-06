export function LivePulse() {
  return (
    <div className="flex items-center gap-2" dir="ltr">
      <span className="relative flex size-3">
        <span className="absolute inset-0 rounded-full bg-[hsl(var(--primary))] opacity-40 animate-pulse-live-ring" />
        <span className="relative inline-flex size-3 rounded-full bg-[hsl(var(--primary))] animate-pulse-live" />
      </span>
      <span className="text-xs font-medium text-primary">البوت نشط الآن</span>
    </div>
  )
}

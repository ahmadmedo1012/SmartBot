import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      {/* v13-D9-K4: 404 screens replace the page tree — skip-link target. */}
      <span id="page-content" className="sr-only" tabIndex={-1} />
      <div className="text-center max-w-md">
        <div className="mb-6">
          {/* r128-F7 (A5 B15): flat ink numeral — the gradient-text 404 retired
              (PORT-KIT §7 discipline: no gradient-text; the optional
              error-scene illustration stays unbuilt — B15 is optional and the
              flat treatment is the honest minimum). */}
          <h1 className="text-7xl font-bold text-accent-foreground">
            404
          </h1>
        </div>
        <h2 className="text-2xl font-bold mb-2">الصفحة غير موجودة</h2>
        <p className="text-muted-foreground mb-6 leading-relaxed">
          ربما تم نقل الصفحة أو حذفها، أو أن الرابط غير صحيح.
        </p>
        {/* r131-F7b (A4 P3-8): the hand-rolled rounded-sm link-buttons retire
            onto the canonical Button (single element via render-prop child —
            the global-error CTA twin; v17-S3's hand-rolled /90 hover fix is
            superseded by the Button's own hover contract). */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/" className="inline-flex">
            <Button className="px-8">الصفحة الرئيسية</Button>
          </Link>
          <Link href="/dashboard" className="inline-flex">
            <Button variant="outline" className="px-8">لوحة التحكم</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

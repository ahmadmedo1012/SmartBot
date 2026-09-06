"use client"

import { useParams } from "next/navigation"
import { HelpCircle } from "lucide-react"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { Button } from "@/components/ui/button"

/* v9-B8 — every one of the 21 dashboard slugs has a dedicated page now, so
 * the catch-all's PAGE_CONFIG / GenericListView / raw query (which never
 * checked res.ok and dumped raw JSON) were 100% dead code. All this route
 * can ever serve is the not-found state for unknown /dashboard/* paths. */

// ── Page Not Found — designed per docs/design-system.md (Track E.4) ──
function PageNotFound({ slug }: { slug: string }) {
  return (
    <SectionContainer className="py-16">
      <div className="mx-auto max-w-md text-center">
        <div className="relative mx-auto mb-6 size-20">
          <div className="absolute inset-0 rounded-full bg-accent" />
          <div className="absolute inset-0 m-4 rounded-full border-2 border-dashed border-accent-foreground/40 rotate-12" />
          <HelpCircle className="absolute inset-0 m-auto size-8 text-accent-foreground" />
        </div>
        <h2 className="text-xl font-bold mb-2">هذا القسم غير متاح</h2>
        <p className="text-sm text-muted-foreground mb-1">
          المسار <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded" dir="ltr">/{slug}</span> غير موجود ضمن لوحة التحكم
        </p>
        <p className="text-xs text-muted-foreground mb-6">
          ربما كان رابطاً قديماً — كل الأقسام متاحة من القائمة الجانبية
        </p>
        <Button variant="outline" onClick={() => window.location.assign("/dashboard")}>
          العودة إلى لوحة التحكم
        </Button>
      </div>
    </SectionContainer>
  )
}

export default function SubDashboardPage() {
  const params = useParams()
  const slugArr = params?.slug as string[] || []
  const slug = slugArr[0] || ""
  return <PageNotFound slug={slug} />
}

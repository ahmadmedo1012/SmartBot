/* r131-F7 (A11 SB-2): shape-matched route fallback (was DefaultLoading —
 * a bare spinner on a 60vh void). */
import { PageSkeleton } from "@/components/ui/PageSkeleton"

export default function Loading() {
  return <PageSkeleton variant="article" />
}

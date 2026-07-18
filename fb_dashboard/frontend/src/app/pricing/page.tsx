import dynamic from "next/dynamic"
import { SectionContainer } from "@/components/ui/SectionContainer"

const PricingContent = dynamic(() => import("./PricingContent"), { ssr: false })

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <SectionContainer>
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-md bg-orange flex items-center justify-center text-white font-bold text-xs">S</div>
              <span className="font-bold text-sm">SmartBot</span>
            </div>
          </div>
        </SectionContainer>
      </header>
      <PricingContent />
    </div>
  )
}

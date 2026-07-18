"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

interface BackButtonProps {
  href?: string
}

export default function BackButton({ href }: BackButtonProps) {
  const router = useRouter()

  if (href) {
    return (
      <Link href={href}>
        <Button variant="ghost" size="sm">
          <ArrowRight className="ms-1 size-4" />
          Back
        </Button>
      </Link>
    )
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => router.back()}>
      <ArrowRight className="ms-1 size-4" />
      Back
    </Button>
  )
}

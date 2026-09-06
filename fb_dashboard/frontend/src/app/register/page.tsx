"use client"

import dynamic from "next/dynamic"

const RegisterForm = dynamic(() => import("./RegisterForm"), { ssr: false })

export default function RegisterPage() {
  return (
    <>
      {/* v9-D3: skip-link target (was missing). Lives in the SSR shell —
          RegisterForm is a ssr:false island, so the anchor must not be
          inside it. Same sr-only pattern as the landing. */}
      <span id="page-content" className="sr-only" tabIndex={-1} />
      <RegisterForm />
    </>
  )
}

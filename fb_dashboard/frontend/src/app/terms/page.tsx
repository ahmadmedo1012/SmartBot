import type { Metadata } from "next"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"

export const metadata: Metadata = {
  title: "Terms of Service",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-20">
        <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
        <div className="space-y-6 text-foreground/80">
          <p>By using SmartBot, you agree to these terms. If you do not agree, please do not use the service.</p>
          <h2 className="text-foreground text-xl font-semibold mt-8">Account</h2>
          <p>When creating an account, you are responsible for maintaining the confidentiality of your login credentials and for all activities under your account.</p>
          <h2 className="text-foreground text-xl font-semibold mt-8">Service</h2>
          <p>SmartBot provides Facebook engagement automation tools. We strive for high availability but do not guarantee uninterrupted service.</p>
          <h2 className="text-foreground text-xl font-semibold mt-8">Compliance</h2>
          <p>You are solely responsible for ensuring your use of SmartBot complies with Facebook's Terms of Service and Platform Policies.</p>
          <h2 className="text-foreground text-xl font-semibold mt-8">Payment</h2>
          <p>Payments are processed through secure payment gateways. We do not store credit card information. Fees are non-refundable except in limited circumstances.</p>
          <h2 className="text-foreground text-xl font-semibold mt-8">Changes to Terms</h2>
          <p>We reserve the right to modify these terms at any time. We will notify you of material changes via the email address registered with your account.</p>
          <p className="text-sm mt-12">Last updated: July 2026</p>
        </div>
      </div>
      <Footer />
    </div>
  )
}

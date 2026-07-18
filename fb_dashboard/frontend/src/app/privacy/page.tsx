import type { Metadata } from "next"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"

export const metadata: Metadata = {
  title: "Privacy Policy",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-20">
        <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
        <div className="space-y-6 text-foreground/80">
          <p>SmartBot is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your personal information.</p>
          <h2 className="text-foreground text-xl font-semibold mt-8">Information We Collect</h2>
          <ul className="list-disc ps-5 space-y-2">
            <li>Account information: name, email address, phone number</li>
            <li>Facebook page data: pages you connect, engagement metrics</li>
            <li>Automation settings: your configured responses, schedules, and rules</li>
            <li>Usage data: interaction logs, analytics, and performance statistics</li>
          </ul>
          <h2 className="text-foreground text-xl font-semibold mt-8">How We Use Your Information</h2>
          <ul className="list-disc ps-5 space-y-2">
            <li>Provide and improve Facebook engagement automation services</li>
            <li>Process automation rules and deliver scheduled content</li>
            <li>Analyze performance and send usage reports</li>
            <li>Communicate about your account and service updates</li>
          </ul>
          <h2 className="text-foreground text-xl font-semibold mt-8">Data Protection</h2>
          <p>We implement advanced security measures to protect your data from unauthorized access, alteration, or disclosure.</p>
          <h2 className="text-foreground text-xl font-semibold mt-8">Third Parties</h2>
          <p>We do not share your information with third parties except when required for service delivery (e.g., Facebook API) and under strict security standards.</p>
          <h2 className="text-foreground text-xl font-semibold mt-8">Contact Us</h2>
          <p>For privacy-related inquiries, please contact us through the support channels available in your account dashboard.</p>
          <p className="text-sm mt-12">Last updated: July 2026</p>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export function generateStaticParams() {
  const slugs = [
    "activity", "ads", "analytics", "audience", "autoreply",
    "billing", "broadcast", "calendar", "comments", "leads",
    "marketing", "messages", "notifications", "pages", "posts",
    "reports", "scheduled", "settings", "support", "team", "tools",
  ]
  return slugs.map(slug => ({ slug: [slug] }))
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}

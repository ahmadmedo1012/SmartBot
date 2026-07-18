export function PublicFooter() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border)",
        padding: "24px 0",
        textAlign: "center",
        fontSize: 13,
        color: "var(--muted)",
      }}
    >
      <div style={{ maxWidth: 1220, margin: "0 auto", padding: "0 24px" }}>
        &copy; {new Date().getFullYear()} SmartBot. All rights reserved.
      </div>
    </footer>
  )
}

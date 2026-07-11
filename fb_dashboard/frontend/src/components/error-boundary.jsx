import { Component } from "react"

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "var(--bg)", color: "var(--fg)" }}>
          <div className="text-center" style={{ maxWidth: "400px" }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" style={{ margin: "0 auto 16px", opacity: 0.7 }}>
              <circle cx="24" cy="24" r="20"/><path d="M24 16v8"/><path d="M24 28v.01"/>
            </svg>
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: 8 }}>حدث خطأ غير متوقع</h2>
            <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: 20 }}>{this.state.error?.message || "تعذر تحميل الصفحة"}</p>
            <button className="btn btn-primary" onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 8a6 6 0 0 1 11.3-2.7M14 8a6 6 0 0 1-11.3 2.7"/><path d="M14 1.5V5.5H10"/><path d="M2 14.5V10.5H6"/></svg>
              إعادة التحميل
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

"use client"

import { Component } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw } from "lucide-react"

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
        <div className="min-h-screen flex items-center justify-center bg-background p-8">
          <div className="text-center space-y-4 max-w-md">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-lg font-bold text-foreground">حدث خطأ غير متوقع</h2>
            <p className="text-sm text-muted-foreground">{this.state.error?.message || "تعذر تحميل الصفحة"}</p>
            <Button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}>
              <RefreshCw className="ml-2 h-4 w-4" />إعادة التحميل
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export async function csrfFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers)
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }
  const csrfToken = getCookie("csrf-token")
  if (csrfToken) {
    headers.set("csrf-token", csrfToken)
  }
  return fetch(url, { ...options, headers, credentials: "include" })
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`))
  return match ? decodeURIComponent(match[2]) : null
}

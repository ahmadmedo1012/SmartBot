import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const publicPaths = [
  "/", "/login", "/pricing", "/subscribe", "/demo",
  "/_next", "/static", "/api", "/favicon",
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Check auth for protected routes
  const authCookie = request.cookies.get("token")?.value
  if (!authCookie) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.png|static).*)"],
}
